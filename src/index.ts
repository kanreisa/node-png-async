/// <reference path="../typings/tsd.d.ts" />
'use strict';

import stream = require('stream');

import Parser = require('./parser');
import Packer = require('./packer');

export interface IImageOptions {
    width?: number;
    height?: number;
    fill?: boolean;
    checkCRC?: boolean;
    deflateChunkSize?: number;
    deflateLevel?: number;
    deflateStrategy?: EDeflateStrategy;
    filterType?: EFilterType;
}

export enum EDeflateStrategy {
    DEFAULT_STRATEGY = 0,
    FILTERED = 1,
    HUFFMAN_ONLY = 2,
    RLE = 3,
    FIXED = 4
}

export enum EFilterType {
    Auto = -1,
    None = 0,
    Sub = 1,
    Up = 2,
    Average = 3,
    Paeth = 4
}

export function createImage(option?: IImageOptions): Image {
    return new Image(option);
}

export class Image extends stream.Duplex {

    width: number;
    height: number;
    gamma: number;
    data: Buffer;

    private _parser: Parser;
    private _packer: Packer;

    constructor(option: IImageOptions = {}) {
        super();

        this.width = option.width || 0;
        this.height = option.height || 0;

        this.data = this.width > 0 && this.height > 0
        ? new Buffer(4 * this.width * this.height) : null;

        if (option.fill && this.data) { this.data.fill(0) };

        this.gamma = 0;
        this.readable = this.writable = true;

        this._parser = new Parser(option || {});

        this._parser.on('error', this.emit.bind(this, 'error'));
        this._parser.on('close', this._handleClose.bind(this));
        this._parser.on('metadata', this._metadata.bind(this));
        this._parser.on('gamma', this._gamma.bind(this));
        this._parser.on('parsed', function (data) {
            this.data = data;
            this.emit('parsed', data);
        }.bind(this));

        this._packer = new Packer(option);
        this._packer.on('data', this.emit.bind(this, 'data'));
        this._packer.on('end', this.emit.bind(this, 'end'));
        this._parser.on('close', this._handleClose.bind(this));
        this._packer.on('error', this.emit.bind(this, 'error'));
    }

    pack(): Image {

        process.nextTick(function () {
            this._packer.pack(this.data, this.width, this.height);
        }.bind(this));

        return this;
    }

    parse(data: Buffer, callback?: (err: Error, image: Image) => void): Image {

        if (callback) {
            var onParsed = null, onError = null;

            this.once('parsed', onParsed = function (data) {
                this.removeListener('error', onError);

                this.data = data;
                callback(null, this);

            }.bind(this));

            this.once('error', onError = function (err) {
                this.removeListener('parsed', onParsed);

                callback(err, null);
            }.bind(this));
        }

        this.end(data);

        return this;
    }

    write(data, cb?): boolean {
        return this._parser.write(data, cb);
    }

    end(data?): void {
        return this._parser.end(data);
    }

    bitblt(dst: Image, sx: number, sy: number, w: number, h: number, dx: number, dy: number) {

        if (sx > this.width || sy > this.height || sx + w > this.width || sy + h > this.height) {
            throw new Error('bitblt reading outside image');
        }
        if (dx > dst.width || dy > dst.height || dx + w > dst.width || dy + h > dst.height) {
            throw new Error('bitblt writing outside image');
        }

        for (var y = 0; y < h; y++) {
            this.data.copy(
                dst.data,
                ((dy + y) * dst.width + dx) << 2,
                ((sy + y) * this.width + sx) << 2,
                ((sy + y) * this.width + sx + w) << 2
            );
        }

        return this;
    }

    _read() {

    }

    private _metadata(metadata): void {

        this.width = metadata.width;
        this.height = metadata.height;
        this.data = metadata.data;

        delete metadata.data;
        this.emit('metadata', metadata);
    }

    private _gamma(gamma: number): void {
        this.gamma = gamma;
    }

    private _handleClose(): void {
        if (!this._parser.writable && !this._packer.readable) {
            this.emit('close');
        }
    }
}

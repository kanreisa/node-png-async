/// <reference path="../typings/tsd.d.ts" />
'use strict';

import zlib = require('zlib');
import stream = require('stream');

import png = require('./index');
import constants = require('./constants');
import CrcStream = require('./crc');
import Filter = require('./filter');

export = Packer;

class Packer extends stream.Readable {

    private _option: png.IImageOptions;

    constructor(option: png.IImageOptions) {
        super();

        this._option = option;

        option.deflateChunkSize = option.deflateChunkSize || 32 * 1024;
        option.deflateLevel = option.deflateLevel || 9;
        if (option.deflateStrategy === undefined) {
            option.deflateStrategy = png.EDeflateStrategy.RLE;
        }

        this.readable = true;
    }

    pack(data: Buffer, width: number, height: number): void {

        // Signature
        this.emit('data', new Buffer(constants.PNG_SIGNATURE));
        this.emit('data', this._packIHDR(width, height));

        // filter pixel data
        var filter = new Filter(width, height, 4, data, this._option);
        data = filter.filter();

        // compress it
        var deflate = zlib.createDeflate({
            chunkSize: this._option.deflateChunkSize,
            level: this._option.deflateLevel,
            strategy: this._option.deflateStrategy
        });

        deflate.on('error', this.emit.bind(this, 'error'));

        deflate.on('data', (data) => {
            this.emit('data', this._packIDAT(data));
        });

        deflate.on('end', () => {
            this.emit('data', this._packIEND());
            this.emit('end');
        });

        deflate.end(data);
    }

    _read() {
        //todo
    }

    private _packChunk(type: number, data?: Buffer): Buffer {

        var len = (data ? data.length : 0),
            buf = new Buffer(len + 12);

        buf.writeUInt32BE(len, 0);
        buf.writeUInt32BE(type, 4);

        if (data) {
            data.copy(buf, 8);
        }

        buf.writeInt32BE(CrcStream.crc32(buf.slice(4, buf.length - 4)), buf.length - 4);

        return buf;
    }

    private _packIHDR(width: number, height: number) {

        var buf = new Buffer(13);
        buf.writeUInt32BE(width, 0);
        buf.writeUInt32BE(height, 4);
        buf[8] = 8;
        buf[9] = 6; // colorType
        buf[10] = 0; // compression
        buf[11] = 0; // filter
        buf[12] = 0; // interlace

        return this._packChunk(constants.TYPE_IHDR, buf);
    }

    private _packIDAT(data: Buffer): Buffer {
        return this._packChunk(constants.TYPE_IDAT, data);
    }

    private _packIEND(): Buffer {
        return this._packChunk(constants.TYPE_IEND, null);
    }
}

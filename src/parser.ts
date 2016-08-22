/// <reference path="../typings/index.d.ts" />
'use strict';

import zlib = require('zlib');

import png = require('./index');
import constants = require('./constants');
import CrcStream = require('./crc');
import ChunkStream = require('./chunk-stream');
import Filter = require('./filter');

var colorTypeToBppMap = {
    0: 1,
    2: 3,
    3: 1,
    4: 2,
    6: 4
};

export = Parser;

class Parser extends ChunkStream {

    private _option: png.IImageOptions;
    private _hasIHDR: boolean;
    private _hasIEND: boolean;
    private _inflate: zlib.Inflate;
    private _filter: Filter;
    private _crc: CrcStream;
    private _palette: number[][];
    private _colorType: number;
    private _chunks: { [type: number]: Function };
    private _data: Buffer;

    constructor(option: png.IImageOptions) {
        super();

        this._option = option;
        option.checkCRC = option.checkCRC !== false;

        this._hasIHDR = false;
        this._hasIEND = false;

        this._inflate = null;
        this._filter = null;
        this._crc = null;

        // input flags/metadata
        this._palette = [];
        this._colorType = 0;

        this._chunks = {};
        this._chunks[constants.TYPE_IHDR] = this._handleIHDR.bind(this);
        this._chunks[constants.TYPE_IEND] = this._handleIEND.bind(this);
        this._chunks[constants.TYPE_IDAT] = this._handleIDAT.bind(this);
        this._chunks[constants.TYPE_PLTE] = this._handlePLTE.bind(this);
        this._chunks[constants.TYPE_tRNS] = this._handleTRNS.bind(this);
        this._chunks[constants.TYPE_gAMA] = this._handleGAMA.bind(this);

        this.writable = true;

        this.on('error', this._handleError.bind(this));
        this._handleSignature();
    }

    private _handleError(): void {

        this.writable = false;

        this.destroy();
    }

    private _handleSignature(): void {

        this.read(
            constants.PNG_SIGNATURE.length,
            this._parseSignature.bind(this)
        );
    }

    private _parseSignature(data: Buffer): void {

        var signature = constants.PNG_SIGNATURE;

        for (var i = 0; i < signature.length; i++) {
            if (data[i] !== signature[i]) {
                this.emit('error', new Error('Invalid file signature'));
                return;
            }
        }

        this.read(8, this._parseChunkBegin.bind(this));
    }

    private _parseChunkBegin(data: Buffer): void {

        // chunk content length
        var length = data.readUInt32BE(0);

        // chunk type
        var type = data.readUInt32BE(4),
            name = '';
        for (var i = 4; i < 8; i++) {
            name += String.fromCharCode(data[i]);
        }

        // console.log('chunk ', name, length);

        // chunk flags
        var ancillary = !!(data[4] & 0x20),  // or critical
            priv = !!(data[5] & 0x20),  // or public
            safeToCopy = !!(data[7] & 0x20);  // or unsafe

        if (!this._hasIHDR && type !== constants.TYPE_IHDR) {
            this.emit('error', new Error('Expected IHDR on beginning'));
            return;
        }

        this._crc = new CrcStream();
        this._crc.write(new Buffer(name));

        if (this._chunks[type]) {
            return this._chunks[type](length);

        } else if (!ancillary) {
            this.emit('error', new Error('Unsupported critical chunk type ' + name));
            return;
        } else {
            this.read(length + 4, this._skipChunk.bind(this));
        }
    }

    private _skipChunk(data: Buffer): void {
        this.read(8, this._parseChunkBegin.bind(this));
    }

    private _handleChunkEnd(): void {
        this.read(4, this._parseChunkEnd.bind(this));
    }

    private _parseChunkEnd(data: Buffer): void {

        var fileCrc = data.readInt32BE(0),
            calcCrc = this._crc.crc32;

        // check CRC
        if (this._option.checkCRC && calcCrc !== fileCrc) {
            this.emit('error', new Error('Crc error'));
            return;
        }

        if (this._hasIEND) {
            this.destroySoon();

        } else {
            this.read(8, this._parseChunkBegin.bind(this));
        }
    }

    private _handleIHDR(length: number): void {
        this.read(length, this._parseIHDR.bind(this));
    }

    private _parseIHDR(data: Buffer): void {

        this._crc.write(data);

        var width = data.readUInt32BE(0),
            height = data.readUInt32BE(4),
            depth = data[8],
            colorType = data[9], // bits: 1 palette, 2 color, 4 alpha
            compr = data[10],
            filter = data[11],
            interlace = data[12];

        if (depth !== 8) {
            this.emit('error', new Error('Unsupported bit depth ' + depth));
            return;
        }
        if (!(colorType in colorTypeToBppMap)) {
            this.emit('error', new Error('Unsupported color type'));
            return;
        }
        if (compr !== 0) {
            this.emit('error', new Error('Unsupported compression method'));
            return;
        }
        if (filter !== 0) {
            this.emit('error', new Error('Unsupported filter method'));
            return;
        }
        if (interlace !== 0) {
            this.emit('error', new Error('Unsupported interlace method'));
            return;
        }

        this._colorType = colorType;

        this._data = new Buffer(width * height * 4);
        this._filter = new Filter(
            width, height,
            colorTypeToBppMap[this._colorType],
            this._data,
            this._option
        );

        this._hasIHDR = true;

        this.emit('metadata', {
            width: width,
            height: height,
            palette: !!(colorType & constants.COLOR_PALETTE),
            color: !!(colorType & constants.COLOR_COLOR),
            alpha: !!(colorType & constants.COLOR_ALPHA),
            data: this._data
        });

        this._handleChunkEnd();
    }

    private _handlePLTE(length: number): void {
        this.read(length, this._parsePLTE.bind(this));
    }

    private _parsePLTE(data: Buffer): void {

        this._crc.write(data);

        var entries = Math.floor(data.length / 3);

        for (var i = 0; i < entries; i++) {
            this._palette.push([
                data.readUInt8(i * 3),
                data.readUInt8(i * 3 + 1),
                data.readUInt8(i * 3 + 2),
                0xff
            ]);
        }

        this._handleChunkEnd();
    }

    private _handleTRNS(length: number): void {
        this.read(length, this._parseTRNS.bind(this));
    }

    private _parseTRNS(data: Buffer): void {

        this._crc.write(data);

        // palette
        if (this._colorType === 3) {
            if (this._palette.length === 0) {
                this.emit('error', new Error('Transparency chunk must be after palette'));
                return;
            }
            if (data.length > this._palette.length) {
                this.emit('error', new Error('More transparent colors than palette size'));
                return;
            }
            for (var i = 0; i < this._palette.length; i++) {
                this._palette[i][3] = i < data.length ? data.readUInt8(i) : 0xff;
            }
        }

        // for colorType 0 (grayscale) and 2 (rgb)
        // there might be one gray/color defined as transparent

        this._handleChunkEnd();
    }

    private _handleGAMA(length: number): void {
        this.read(length, this._parseGAMA.bind(this));
    }

    private _parseGAMA(data: Buffer): void {

        this._crc.write(data);
        this.emit('gamma', data.readUInt32BE(0) / 100000);

        this._handleChunkEnd();
    }

    private _handleIDAT(length: number): void {
        this.read(-length, this._parseIDAT.bind(this, length));
    }

    private _parseIDAT(length: number, data: Buffer): void {

        this._crc.write(data);

        if (this._colorType === 3 && this._palette.length === 0) {
            throw new Error('Expected palette not found');
        }

        if (!this._inflate) {
            this._inflate = zlib.createInflate();

            this._inflate.on('error', this.emit.bind(this, 'error'));
            this._filter.on('complete', this._reverseFiltered.bind(this));

            this._inflate.pipe(this._filter);
        }

        this._inflate.write(data);
        length -= data.length;

        if (length > 0) {
            this._handleIDAT(length);
        } else {
            this._handleChunkEnd();
        }
    }

    private _handleIEND(length: number): void {
        this.read(length, this._parseIEND.bind(this));
    }

    private _parseIEND(data: Buffer): void {

        this._crc.write(data);

        // no more data to inflate
        this._inflate.end();

        this._hasIEND = true;
        this._handleChunkEnd();
    }

    private _reverseFiltered(data: Buffer, width: number, height: number): void {

        if (this._colorType === 3) { // paletted

            var i: number, y: number, x: number, pxRowPos: number, pxPos: number, color: number[];

            // use values from palette
            var pxLineLength = width << 2;

            for (y = 0; y < height; y++) {
                pxRowPos = y * pxLineLength;

                for (x = 0; x < width; x++) {
                    pxPos = pxRowPos + (x << 2),
                    color = this._palette[data[pxPos]];

                    for (i = 0; i < 4; i++) {
                        data[pxPos + i] = color[i];
                    }
                }
            }
        }

        this.emit('parsed', data);
    }
}

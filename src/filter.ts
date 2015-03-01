/// <reference path="../typings/tsd.d.ts" />
'use strict';

import zlib = require('zlib');

import png = require('./index');
import ChunkStream = require('./chunk-stream');

var pixelBppMap = {
    1: { // L
        0: 0,
        1: 0,
        2: 0,
        3: 0xff
    },
    2: { // LA
        0: 0,
        1: 0,
        2: 0,
        3: 1
    },
    3: { // RGB
        0: 0,
        1: 1,
        2: 2,
        3: 0xff
    },
    4: { // RGBA
        0: 0,
        1: 1,
        2: 2,
        3: 3
    }
};

var PaethPredictor = function (left: number, above: number, upLeft: number): number {

    var p = left + above - upLeft,
        pLeft = Math.abs(p - left),
        pAbove = Math.abs(p - above),
        pUpLeft = Math.abs(p - upLeft);

    if (pLeft <= pAbove && pLeft <= pUpLeft) {
        return left;
    } else if (pAbove <= pUpLeft) {
        return above;
    } else {
        return upLeft;
    }
};

export = Filter;

class Filter extends ChunkStream {

    private _width: number;
    private _height: number;
    private _bpp: number;
    private _data: Buffer;
    private _option: png.IImageOptions;
    private _line: number;
    private _filterTypes: png.EFilterType[];
    private _filters: { [index: number]: Function };

    constructor(width: number, height: number, bpp: number, data: Buffer, option: png.IImageOptions) {
        super();

        this._width = width;
        this._height = height;
        this._bpp = bpp;
        this._data = data;
        this._option = option;

        this._line = 0;

        if (option.filterType === undefined || option.filterType === -1) {
            this._filterTypes = [0, 1, 2, 3, 4];
        } else if (typeof option.filterType === 'number') {
            this._filterTypes = [option.filterType];
        }

        this._filters = {
            0: this._filterNone.bind(this),
            1: this._filterSub.bind(this),
            2: this._filterUp.bind(this),
            3: this._filterAvg.bind(this),
            4: this._filterPaeth.bind(this)
        };

        this.read(this._width * bpp + 1, this._reverseFilterLine.bind(this));
    }

    filter(): Buffer {

        var pxData = this._data,
            rawData = new Buffer(((this._width << 2) + 1) * this._height);

        for (var y = 0; y < this._height; y++) {

            // find best filter for this line (with lowest sum of values)
            var min = Infinity,
                sel = 0;

            for (var i = 0, l = this._filterTypes.length; i < l; i++) {
                var sum = this._filters[this._filterTypes[i]](pxData, y, null);
                if (sum < min) {
                    sel = this._filterTypes[i];
                    min = sum;
                }
            }

            this._filters[sel](pxData, y, rawData);
        }
        return rawData;
    }

    private _reverseFilterLine(rawData: Buffer): void {

        var pxData = this._data,
            pxLineLength = this._width << 2,
            pxRowPos = this._line * pxLineLength,
            filter = rawData[0];

        if (filter == 0) {
            for (var x = 0; x < this._width; x++) {
                var pxPos = pxRowPos + (x << 2),
                    rawPos = 1 + x * this._bpp;

                for (var i = 0; i < 4; i++) {
                    var idx = pixelBppMap[this._bpp][i];
                    pxData[pxPos + i] = idx != 0xff ? rawData[rawPos + idx] : 0xff;
                }
            }

        } else if (filter == 1) {
            for (var x = 0; x < this._width; x++) {
                var pxPos = pxRowPos + (x << 2),
                    rawPos = 1 + x * this._bpp;

                for (var i = 0; i < 4; i++) {
                    var idx = pixelBppMap[this._bpp][i],
                        left = x > 0 ? pxData[pxPos + i - 4] : 0;

                    pxData[pxPos + i] = idx != 0xff ? rawData[rawPos + idx] + left : 0xff;
                }
            }

        } else if (filter == 2) {
            for (var x = 0; x < this._width; x++) {
                var pxPos = pxRowPos + (x << 2),
                    rawPos = 1 + x * this._bpp;

                for (var i = 0; i < 4; i++) {
                    var idx = pixelBppMap[this._bpp][i],
                        up = this._line > 0 ? pxData[pxPos - pxLineLength + i] : 0;

                    pxData[pxPos + i] = idx != 0xff ? rawData[rawPos + idx] + up : 0xff;
                }

            }

        } else if (filter == 3) {
            for (var x = 0; x < this._width; x++) {
                var pxPos = pxRowPos + (x << 2),
                    rawPos = 1 + x * this._bpp;

                for (var i = 0; i < 4; i++) {
                    var idx = pixelBppMap[this._bpp][i],
                        left = x > 0 ? pxData[pxPos + i - 4] : 0,
                        up = this._line > 0 ? pxData[pxPos - pxLineLength + i] : 0,
                        add = Math.floor((left + up) / 2);

                    pxData[pxPos + i] = idx != 0xff ? rawData[rawPos + idx] + add : 0xff;
                }

            }

        } else if (filter == 4) {
            for (var x = 0; x < this._width; x++) {
                var pxPos = pxRowPos + (x << 2),
                    rawPos = 1 + x * this._bpp;

                for (var i = 0; i < 4; i++) {
                    var idx = pixelBppMap[this._bpp][i],
                        left = x > 0 ? pxData[pxPos + i - 4] : 0,
                        up = this._line > 0 ? pxData[pxPos - pxLineLength + i] : 0,
                        upLeft = x > 0 && this._line > 0
                        ? pxData[pxPos - pxLineLength + i - 4] : 0,
                        add = PaethPredictor(left, up, upLeft);

                    pxData[pxPos + i] = idx != 0xff ? rawData[rawPos + idx] + add : 0xff;
                }
            }
        }


        this._line++;

        if (this._line < this._height) {
            this.read(this._width * this._bpp + 1, this._reverseFilterLine.bind(this));
        } else {
            this.emit('complete', this._data, this._width, this._height);
        }
    }

    private _filterNone(pxData: Buffer, y: number, rawData: Buffer): number {

        var pxRowLength = this._width << 2,
            rawRowLength = pxRowLength + 1,
            sum = 0;

        if (!rawData) {
            for (var x = 0; x < pxRowLength; x++)
                sum += Math.abs(pxData[y * pxRowLength + x]);

        } else {
            rawData[y * rawRowLength] = 0;
            pxData.copy(rawData, rawRowLength * y + 1, pxRowLength * y, pxRowLength * (y + 1));
        }

        return sum;
    }

    private _filterSub(pxData: Buffer, y: number, rawData: Buffer): number {

        var pxRowLength = this._width << 2,
            rawRowLength = pxRowLength + 1,
            sum = 0;

        if (rawData)
            rawData[y * rawRowLength] = 1;

        for (var x = 0; x < pxRowLength; x++) {

            var left = x >= 4 ? pxData[y * pxRowLength + x - 4] : 0,
                val = pxData[y * pxRowLength + x] - left;

            if (!rawData) sum += Math.abs(val);
            else rawData[y * rawRowLength + 1 + x] = val;
        }

        return sum;
    }

    private _filterUp(pxData: Buffer, y: number, rawData: Buffer): number {

        var pxRowLength = this._width << 2,
            rawRowLength = pxRowLength + 1,
            sum = 0;

        if (rawData)
            rawData[y * rawRowLength] = 2;

        for (var x = 0; x < pxRowLength; x++) {

            var up = y > 0 ? pxData[(y - 1) * pxRowLength + x] : 0,
                val = pxData[y * pxRowLength + x] - up;

            if (!rawData) sum += Math.abs(val);
            else rawData[y * rawRowLength + 1 + x] = val;
        }

        return sum;
    }

    private _filterAvg(pxData: Buffer, y: number, rawData: Buffer): number {

        var pxRowLength = this._width << 2,
            rawRowLength = pxRowLength + 1,
            sum = 0;

        if (rawData)
            rawData[y * rawRowLength] = 3;

        for (var x = 0; x < pxRowLength; x++) {

            var left = x >= 4 ? pxData[y * pxRowLength + x - 4] : 0,
                up = y > 0 ? pxData[(y - 1) * pxRowLength + x] : 0,
                val = pxData[y * pxRowLength + x] - ((left + up) >> 1);

            if (!rawData) sum += Math.abs(val);
            else rawData[y * rawRowLength + 1 + x] = val;
        }

        return sum;
    }

    private _filterPaeth(pxData: Buffer, y: number, rawData: Buffer): number {

        var pxRowLength = this._width << 2,
            rawRowLength = pxRowLength + 1,
            sum = 0;

        if (rawData)
            rawData[y * rawRowLength] = 4;

        for (var x = 0; x < pxRowLength; x++) {

            var left = x >= 4 ? pxData[y * pxRowLength + x - 4] : 0,
                up = y > 0 ? pxData[(y - 1) * pxRowLength + x] : 0,
                upLeft = x >= 4 && y > 0 ? pxData[(y - 1) * pxRowLength + x - 4] : 0,
                val = pxData[y * pxRowLength + x] - PaethPredictor(left, up, upLeft);

            if (!rawData) sum += Math.abs(val);
            else rawData[y * rawRowLength + 1 + x] = val;
        }

        return sum;
    }
}

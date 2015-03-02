/*jslint node:true, white:true, vars:true, nomen:true, plusplus:true, bitwise:true */
/*global describe, it, before */
'use strict';

var fs = require('fs');
var should = require('should');
var png = require("..");

var a = __dirname + '/_a.png';
var b = __dirname + '/_b.png';
var c = __dirname + '/_c.png';
var d = __dirname + '/_d.png';
var bg = __dirname + '/_bg.png';

var devnull = process.platform === 'win32' ? 'nul' : '/dev/null';

describe('Async Tests', function() {

    var img;

    before(function () {
        img = new png.Image({
            width: 1,
            height: 1,
            fill: true
        });
    });

    describe('#pack()', function () {

        it('test', function (done) {

            img.pack().pipe(fs.createWriteStream(devnull));

            var counter = 0;

            img.on('end', function () {
                
                ++counter;
                should.strictEqual(2, counter);

                done();
            });

            should.strictEqual(0, counter);
            ++counter;
        });
    });
});


describe('Create PNGs', function() {

    it('a) 1 x 1 px', function(done) {

        var img = new png.Image({
            width: 1,
            height: 1,
            fill: true
        });

        img.on('end', function () {

            var i, l;
            for (i = 0, l = this.data.length; i < l; i++) {
                should.strictEqual(0, this.data[i]);
            }
        });

        img.pack().pipe(fs.createWriteStream(a)).on('finish', done);
    });

    it('b) 50 x 50 px', function (done) {

        var img = new png.Image({
            width: 50,
            height: 50,
            fill: true
        });

        img.on('end', function () {

            var i, l;
            for (i = 0, l = this.data.length; i < l; i++) {
                should.strictEqual(0, this.data[i]);
            }

            should.strictEqual(50 * 50 * 4, this.data.length);
        });

        img.pack().pipe(fs.createWriteStream(b)).on('finish', done);
    });

    it('bg.png', function (done) {

        var img = new png.Image({
            width: 10,
            height: 10,
            filterType: -1
        });

        var x, y;
        for (y = 0; y < img.height; y++) {
            for (x = 0; x < img.width; x++) {
                var idx = (img.width * y + x) << 2;

                var col = x < (img.width >> 1) ^ y < (img.height >> 1) ? 0xe5 : 0xff;

                img.data[idx] = col;
                img.data[idx + 1] = col;
                img.data[idx + 2] = col;
                img.data[idx + 3] = 0xff;
            }
        }

        img.pack().pipe(fs.createWriteStream(bg)).on('finish', done);
    });
});

describe('Manipulation', function () {

    it('c) thru', function(done) {

        var img = new png.Image();

        fs.createReadStream(a).pipe(img);

        img.on('parsed', function () {

            var x, y;
            for (y = 0; y < img.height; y++) {
                for (x = 0; x < img.width; x++) {
                    var idx = (img.width * y + x) << 2;

                    if (
                        Math.abs(img.data[idx] - img.data[idx+1]) <= 1 &&
                        Math.abs(img.data[idx+1] - img.data[idx+2]) <= 1
                    ) {
                        img.data[idx] = img.data[idx+1] = img.data[idx+2];
                    }

                }
            }

            img.pack().pipe(fs.createWriteStream(c)).on('finish', done);
        });
    });

    it('d) invert color + reduce opacity', function (done) {

        fs.createReadStream(b).pipe(new png.Image({
            filterType: 4
        }).on('parsed', function () {

            var x, y, idx;
            for (y = 0; y < this.height; y++) {
                for (x = 0; x < this.width; x++) {
                    idx = (this.width * y + x) << 2;

                    // invert color
                    this.data[idx] = 255 - this.data[idx];
                    this.data[idx+1] = 255 - this.data[idx+1];
                    this.data[idx+2] = 255 - this.data[idx+2];

                    // and reduce opacity
                    this.data[idx+3] = this.data[idx+3] >> 1;
                }
            }

            this.pack().pipe(fs.createWriteStream(d)).on('finish', done);
        }));
    });
});

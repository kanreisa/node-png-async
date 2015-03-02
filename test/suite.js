/*jslint node:true, white:true, vars:true, nomen:true, plusplus:true, bitwise:true */
/*global describe, it, before */
'use strict';

var fs = require('fs');
var should = require('should');
var png = require("..");

describe('PNGSUITE', function () {

    var files = fs.readdirSync(__dirname + '/img/');

    files.forEach(function (file) {

        if (!file.match(/\.png$/i)) {
            return;
        }

        it(file, function (done) {

            fs.createReadStream(__dirname + '/img/' + file).pipe(new png.Image()).on('parsed', function () {

                if (this.gamma) {
                    for (var y = 0; y < this.height; y++) {
                        for (var x = 0; x < this.width; x++) {
                            var idx = (this.width * y + x) << 2;

                            for (var i = 0; i < 3; i++) {
                                var sample = this.data[idx + i] / 255;
                                sample = Math.pow(sample, 1 / 2.2 / this.gamma);
                                this.data[idx + i] = Math.round(sample * 255);
                            }
                        }
                    }
                }

                this.pack().pipe(fs.createWriteStream(__dirname + '/out/' + file)).on('finish', done);
            });
        });
    });
});
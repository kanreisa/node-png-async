/*jslint node:true, white:true */
'use strict';

var fs = require('fs');
var gulp = require('gulp');
var rename = require('gulp-rename');
var mocha = require('gulp-mocha');
var typescript = require('gulp-typescript');
var merge = require('merge2');

gulp.task('tsc', function () {

    var result = gulp.src('src/*.ts').pipe(typescript({
        target: 'ES6',
        module: 'commonjs',
        declarationFiles: true
    }));

    return merge([
        result.dts.pipe(gulp.dest('lib')),
        result.js.pipe(gulp.dest('lib'))
    ]);
});

function test() {
    return gulp.src(['test/*.js']).pipe(mocha({ reporter: 'spec', timeout: 100, slow: 10 }));
};
gulp.task('test', test);

gulp.task('build', ['tsc']);

gulp.task('watch', function () {
    gulp.watch('src/*.ts', ['default']);
    gulp.watch('test/*.js', ['test']);
});

gulp.task('default', ['build'], test);

'use strict';

const fs = require('fs');
const gulp = require('gulp');
const rename = require('gulp-rename');
const mocha = require('gulp-mocha');
const typescript = require('gulp-typescript');
const merge = require('merge2');

gulp.task('tsc', () => {

    const result = gulp.src('src/*.ts').pipe(typescript({
        target: 'ES5',
        module: 'commonjs',
        declarationFiles: true
    }));

    return merge([
        result.dts.pipe(gulp.dest('lib')),
        result.js.pipe(gulp.dest('lib'))
    ]);
});

function test() {
    return gulp.src(['test/*.js']).pipe(mocha({ reporter: 'spec', timeout: 3000, slow: 10 }));
};
gulp.task('test', test);

gulp.task('build', ['tsc']);

gulp.task('watch', () => {
    gulp.watch('src/*.ts', ['default']);
    gulp.watch('test/*.js', ['test']);
});

gulp.task('default', ['build'], test);

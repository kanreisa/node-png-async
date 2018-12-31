"use strict";

const gulp = require("gulp");
const typescript = require("gulp-typescript");
const sourcemaps = require("gulp-sourcemaps");

gulp.task("build", () => {
    return gulp
        .src([
            "src/**/*.ts"
        ])
        .pipe(sourcemaps.init())
        .pipe(typescript({
            typescript: require("typescript"),
            alwaysStrict: true,
            target: "ES6",
            module: "commonjs",
            moduleResolution: "node",
            removeComments: false,
            declarationFiles: true
        }))
        .pipe(sourcemaps.write("./"))
        .pipe(gulp.dest("lib"));
});

gulp.task("watch", () => {
    gulp.watch("src/**/*.ts", gulp.task("build"));
});

gulp.task("default", gulp.task("build"));

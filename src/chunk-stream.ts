/// <reference path="../typings/index.d.ts" />
'use strict';

import stream = require('stream');

export = ChunkStream;

class ChunkStream extends stream.Duplex {

    private _buffers: Buffer[];
    private _buffered: number;
    private _reads: any[];
    private _paused: boolean;
    private _encoding: string;

    constructor() {
        super();

        this._buffers = [];
        this._buffered = 0;

        this._reads = [];
        this._paused = false;

        this.writable = true;
    }

    _read(size) {
        throw new Error('Not implemented');
    }

    _write(data, encoding, cb) {

        if (this.writable === false) {
            cb(new Error('Stream not writable'));
            return false;
        }

        this._buffers.push(data);
        this._buffered += data.length;

        setImmediate(() => this._process());

        // ok if there are no more read requests
        if (this._reads && this._reads.length === 0) {
            this._paused = true;
        }

        cb();
    }

    read(length, callback?) {

        this._reads.push({
            length: Math.abs(length),  // if length < 0 then at most this length
            allowLess: length < 0,
            func: callback
        });

        setImmediate(() => {

            this._process();

            // its paused and there is not enought data then ask for more
            if (this._paused && this._reads.length > 0) {
                this._paused = false;

                this.emit('drain');
            }
        });
    }

    end(data?): void {

        if (data) {
            this.write(data);
        }

        this.writable = false;

        // already destroyed
        if (!this._buffers) return;

        // enqueue or handle end
        if (this._buffers.length === 0) {
            this._end();
        } else {
            this._buffers.push(null);
            setImmediate(() => this._process());
        }
    }

    destroySoon = this.end;

    destroy() {

        if (!this._buffers) {
            return;
        }

        this.writable = false;
        this._reads = null;
        this._buffers = null;

        this.emit('close');
    }

    private _end() {

        if (this._reads.length > 0) {
            this.emit('error', new Error('There are some read requests waitng on finished stream'));
        }

        this.destroy();
    }

    private _process() {

        var buf: Buffer, data: Buffer, len: number, pos: number, count: number, read: any;

        // as long as there is any data and read requests
        while (this._buffered > 0 && this._reads && this._reads.length > 0) {

            read = this._reads[0];

            // read any data (but no more than length)
            if (read.allowLess) {

                // ok there is any data so that we can satisfy this request
                this._reads.shift(); // == read

                // first we need to peek into first buffer
                buf = this._buffers[0];

                // ok there is more data than we need
                if (buf.length > read.length) {

                    this._buffered -= read.length;
                    this._buffers[0] = buf.slice(read.length);

                    read.func.call(this, buf.slice(0, read.length));

                } else {
                    // ok this is less than maximum length so use it all
                    this._buffered -= buf.length;
                    this._buffers.shift(); // == buf

                    read.func.call(this, buf);
                }
            } else if (this._buffered >= read.length) {
                // ok we can meet some expectations

                this._reads.shift(); // == read

                pos = 0;
                count = 0;
                data = new Buffer(read.length);

                // create buffer for all data
                while (pos < read.length) {
                    buf = this._buffers[count++];
                    len = Math.min(buf.length, read.length - pos);

                    buf.copy(data, pos, 0, len);
                    pos += len;

                    // last buffer wasn't used all so just slice it and leave
                    if (len !== buf.length) {
                        this._buffers[--count] = buf.slice(len);
                    }
                }

                // remove all used buffers
                if (count > 0) {
                    this._buffers.splice(0, count);
                }

                this._buffered -= read.length;

                read.func.call(this, data);

            } else {
                // not enought data to satisfy first request in queue
                // so we need to wait for more
                break;
            }
        }

        if (this._buffers && this._buffers.length > 0 && this._buffers[0] === null) {
            this._end();
        }
    }
}

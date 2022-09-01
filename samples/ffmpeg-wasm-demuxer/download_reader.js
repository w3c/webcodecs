import {SharedReadBuffer} from './shared_read_buffer.js'

class DownloadSink {
  #onChunk = null;
  #onEOF = null;

  constructor(onChunk, onEOF) {
    this.#onChunk = onChunk;
    this.#onEOF = onEOF;
  }

  write(chunk) {
    this.#onChunk(chunk);
  }

  close() {
    this.#onEOF();
  }
}

export class DownloadReader {
  #fileStorage = null;
  #writePtr = 0;
  #readPtr = 0;
  #eof = false;
  #pendingReadNumBytes = 0;
  #sharedReadBuffer = null;
  #enableLogging = false;

  async initialize(fileUri, sab) {
    this.#sharedReadBuffer = new SharedReadBuffer(sab);

    // Fetch the file and pipe the data through.
    const downloadSink = new DownloadSink(this._onChunk.bind(this), this._onEOF.bind(this));
    this._log('starting fetch');
    fetch(fileUri).then(response => {
      // highWaterMark should be large enough for smooth streaming, but lower is
      // better for memory usage.
      response.body.pipeTo(new WritableStream(downloadSink, {highWaterMark: 2}));
    });
  }

  read(numBytes) {
    this._log(`read(${numBytes})`);
    let bytesUnread = this.#writePtr - this.#readPtr;
    let cappedForEOF = false;
    if (numBytes > bytesUnread) {
      if (!this.#eof) {
        this._log(`waiting for more chunks`);
        // Read will complete in _onChunk() once enough bytes become available.
        this.#pendingReadNumBytes = numBytes;
        return;
      } else {
        this._log(`capping read for EOF`);
        cappedForEOF = true;
        numBytes = bytesUnread;
      }
    }

    this._log(`read() - fulfilling now!`);

    this.#pendingReadNumBytes = 0;
    this.#sharedReadBuffer.write(new Uint8Array(this.#fileStorage.buffer,
        this.#readPtr, numBytes), cappedForEOF);
    this.#readPtr += numBytes;
  }

  _onChunk(chunk) {
    this._log(`got chunk w/ ${chunk.byteLength} bytes`);

    if (this.#fileStorage == null) {
      // Arbitrary. Most files will be bigger than this. We'll grow it by 2x as
      // needed.
      const INIT_CAPACITY = 100_000;
      this.#fileStorage = new Uint8Array(INIT_CAPACITY);
    }

    let remainingBytes = this.#fileStorage.byteLength - this.#writePtr;
    if (remainingBytes < chunk.byteLength) {
      let oldStorage = this.#fileStorage;
      let newSize = 2 * Math.max(chunk.byteLength, oldStorage.byteLength);
      this.#fileStorage = new Uint8Array(newSize);
      this.#fileStorage.set(oldStorage);
    }

    this.#fileStorage.set(chunk, this.#writePtr);
    this.#writePtr += chunk.byteLength;

    if (this.#pendingReadNumBytes > 0) {
      this._log('Trying to complete pending read');
      this.read(this.#pendingReadNumBytes);
    }
  }

  _onEOF() {
    this._log(`got EOF, buffered ${this.#writePtr} total bytes`);
    this.#eof = true;
  }


  _log(msg) {
    if (this.#enableLogging)
      debugLog('[DownloadReader]: ' + msg);
  }
}

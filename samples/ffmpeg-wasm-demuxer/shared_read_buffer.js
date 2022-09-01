// Wraps a SharedArrayBuffer used to fulfill "read" requests between workers for
// the DownloadReader and FFmpegDemuxerBlockingHelper. Read requests will block
// (Atomics.wait()) until fulfilled.
export class SharedReadBuffer {
  // Offset storage for this.#readSignal and this.#writeSize
  static STORAGE_OFFSET = Int32Array.BYTES_PER_ELEMENT +
                          Uint32Array.BYTES_PER_ELEMENT;

  static getStorageForNumBytes(numBytes) {
    return new SharedArrayBuffer(numBytes +
        SharedReadBuffer.STORAGE_OFFSET);
  }

  #enableLogging = false;
  #readSignal = null;
  #writeSize = null;
  #storage = null;

  constructor(sab) {
    this.#readSignal = new Int32Array(sab, 0, 1);
    this.#writeSize = new Uint32Array(sab, Int32Array.BYTES_PER_ELEMENT, 1);
    this.#storage = new Uint8Array(sab, SharedReadBuffer.STORAGE_OFFSET,
        sab.byteLength - SharedReadBuffer.STORAGE_OFFSET);
  }

  blockingRead(downloadWorker, buffer) {
    this._log(`blockingRead() requesting ${buffer.byteLength} bytes`);
    // Expect one read at a time, and only from one worker
    console.assert(Atomics.load(this.#readSignal, 0) == 0);

    // Read's must all be within size of SAB
    console.assert(buffer.byteLength <= this.#storage.byteLength);

    // Set the read signal to indicate we're trying to read.
    Atomics.store(this.#readSignal, 0, 1);

    // Wait for read!
    downloadWorker.postMessage({command: 'read', numBytes: buffer.byteLength});
    Atomics.wait(this.#readSignal, 0, 1);

    // Other side may write less than we requested upon hitting EOF.
    let writeSize = Atomics.load(this.#writeSize, 0);

    // Make a view of this.#storage with byteLength matching that of
    // outputBuffer so we can use set() below.
    let storageView = new Uint8Array(this.#storage.buffer,
        SharedReadBuffer.STORAGE_OFFSET, writeSize);

    buffer.set(storageView);
    this._log(`blockingRead() done; got ${writeSize} bytes`);
    return writeSize;
  }

  write(buffer) {
    this._log(`Writing ${buffer.byteLength} bytes`);
    // We should only write in response to a read request
    console.assert(Atomics.load(this.#readSignal, 0) == 1);
    this.#storage.set(buffer);

    // Note bytes written (may be less than requested for EOF)
    Atomics.store(this.#writeSize, 0, buffer.byteLength);

    // Clear the read signal and wake up the waiting thread.
    Atomics.store(this.#readSignal, 0, 0);
    Atomics.notify(this.#readSignal, 0, 1);
  }

  _log(msg) {
    if (this.#enableLogging)
      debugLog('[ReadBuffer]: ' + msg);
  }
}
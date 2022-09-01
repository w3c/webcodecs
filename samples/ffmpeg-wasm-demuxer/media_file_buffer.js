
export class MediaFileBuffer {
  constructor(sab) {

    // 9 bytes used for
    this.capacity = (sab.byteLength - 9)
    this.buf = sab;
    this.write_ptr = new Uint32Array(this.buf, 0, 1);
    this.read_ptr = new Uint32Array(this.buf, 4, 1);
    this.status = new Uint8Array(this.buf, 8, 1);
    this.storage = new type(this.buf, 9, this.capacity);
  }

  // Returns "writing" or "eof" so you know when to wait vs give up for a read.
  // NOTE: we don't need a "full" for new Sab signal. Writer side will just send a new sab out of band as needed.
  status() {
  }

  numBytesUnread() {

  }

  read(buffer, size) {

  }



}
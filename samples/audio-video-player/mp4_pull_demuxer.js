const ENABLE_DEBUG_LOGGING = false;

function debugLog(msg) {
  if (!ENABLE_DEBUG_LOGGING) {
    return;
  }
  console.debug(msg);
}

// Wrapper around MP4Box.js that shims pull-based demuxing on top their
// push-based API.
export class MP4PullDemuxer {
  constructor(uri) {
    this.source = new MP4Source(uri);
    this.readySamples = [];
    this._pending_read_resolver = null;
  }

  getAvcDescription(avccBox) {
    const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
    avccBox.write(stream);
    return new Uint8Array(stream.buffer, 8);  // Remove the box header.
  }

  async ready() {
    let info = await this.source.getInfo();
    this.videoTrack = info.videoTracks[0];
    this.audioTrack = info.audioTracks[0];
  }

  async getAudioTrackInfo() {
    await this.ready();

    let info = {
      codec: this.audioTrack.codec,
      numberOfChannels: this.audioTrack.audio.channel_count,
      sampleRate: this.audioTrack.audio.sample_rate,
      extradata: this.source.getAudioSpecificConfig()
    };

    return info;
  }

  async getVideoTrackInfo() {
    await this.ready();

    let info = {
      codec: this.videoTrack.codec,
      displayWidth: this.videoTrack.track_width,
      displayHeight: this.videoTrack.track_height,
      extradata: this.getAvcDescription(this.source.getAvccBox())
    }

    return Promise.resolve(info);
  }

  selectTrack(track) {
    console.assert(!this.selectedTrack, "changing tracks is not implemented");
    this.selectedTrack = track;
    this.source.selectTrack(track);
  }

  selectVideo() {
    this.selectTrack(this.videoTrack);
  }

  selectAudio() {
    this.selectTrack(this.audioTrack);
  }

  async readSample() {
    console.assert(this.selectedTrack);
    console.assert(!this._pending_read_resolver);

    if (this.readySamples.length) {
      return Promise.resolve(this.readySamples.shift());
    }

    let promise = new Promise((resolver) => { this._pending_read_resolver = resolver; });
    console.assert(this._pending_read_resolver);
    this.source.start(this.onSamples.bind(this));
    return promise;

  }

  onSamples(samples) {
    const SAMPLE_BUFFER_TARGET_SIZE = 50;

    this.readySamples.push(...samples);
    if (this.readySamples.length >= SAMPLE_BUFFER_TARGET_SIZE)
      this.source.stop();

    let firstSampleTime = samples[0].cts * 1000000 / samples[0].timescale ;
    debugLog(`adding new ${samples.length} samples (first = ${firstSampleTime}). total = ${this.readySamples.length}`);

    if (this._pending_read_resolver) {
      this._pending_read_resolver(this.readySamples.shift());
      this._pending_read_resolver = null;
    }
  }
}

class MP4Source {
  constructor(uri) {
    this.file = MP4Box.createFile();
    this.file.onError = console.error.bind(console);
    this.file.onReady = this.onReady.bind(this);
    this.file.onSamples = this.onSamples.bind(this);

    debugLog('fetching file');
    fetch(uri).then(response => {
      debugLog('fetch responded');
      const reader = response.body.getReader();
      let offset = 0;
      let mp4File = this.file;

      function appendBuffers({done, value}) {
        if(done) {
          mp4File.flush();
          return;
        }
        let buf = value.buffer;
        buf.fileStart = offset;

        offset += buf.byteLength;

        mp4File.appendBuffer(buf);

        return reader.read().then(appendBuffers);
      }

      return reader.read().then(appendBuffers);
    })

    this.info = null;
    this._info_resolver = null;
  }

  onReady(info) {
    // TODO: Generate configuration changes.
    this.info = info;

    if (this._info_resolver) {
      this._info_resolver(info);
      this._info_resolver = null;
    }
  }

  getInfo() {
    if (this.info)
      return Promise.resolve(this.info);

    return new Promise((resolver) => { this._info_resolver = resolver; });
  }

  getAvccBox() {
    // TODO: make sure this is coming from the right track.
    return this.file.moov.traks[0].mdia.minf.stbl.stsd.entries[0].avcC
  }

  getAudioSpecificConfig() {
    // TODO: make sure this is coming from the right track.

    // 0x04 is the DecoderConfigDescrTag. Assuming MP4Box always puts this at position 0.
    console.assert(this.file.moov.traks[0].mdia.minf.stbl.stsd.entries[0].esds.esd.descs[0].tag == 0x04);
    // 0x40 is the Audio OTI, per table 5 of ISO 14496-1
    console.assert(this.file.moov.traks[0].mdia.minf.stbl.stsd.entries[0].esds.esd.descs[0].oti == 0x40);
    // 0x05 is the DecSpecificInfoTag
    console.assert(this.file.moov.traks[0].mdia.minf.stbl.stsd.entries[0].esds.esd.descs[0].descs[0].tag == 0x05);

    return this.file.moov.traks[0].mdia.minf.stbl.stsd.entries[0].esds.esd.descs[0].descs[0].data;
  }

  selectTrack(track) {
    debugLog('selecting track %d', track.id);
    this.file.setExtractionOptions(track.id);
  }

  start(onSamples) {
    this._onSamples = onSamples;
    this.file.start();
  }

  stop() {
    this.file.stop();
  }

  onSamples(track_id, ref, samples) {
    this._onSamples(samples);
  }
}

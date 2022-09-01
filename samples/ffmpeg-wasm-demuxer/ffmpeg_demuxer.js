// FFmpegDemuxer is a simple proxy to FFmpegDemuxerBlocking, which lives in a
// separate worker where actual FFmpeg API calls (and blocking) take place.
// This design allows the "media worker" to use the FFmpeg demuxer without being
// blocked.

import {PullDemuxerBase, AUDIO_STREAM_TYPE} from '../library/pull_demuxer_base.js'

let Module = null;

export class FFmpegDemuxer extends PullDemuxerBase {
  #fileUri = null;
  #decoderConfig = null;
  #initResolver = null;
  #chunkResolver = null;
  #blockingWorker = null;
  #messageChannel = null;

  constructor(fileUri) {
    super();
    this.#fileUri = fileUri
  }

  async initialize(streamType) {
    // It would be easy to support video, but this is intended as a demo, not a
    // full featured library.
    console.assert(streamType == AUDIO_STREAM_TYPE,
                   'This demuxer currently supports audio');

    // Message channel is used to facilitate defining message handling within
    // the scope of this class (vs the global 'message' event).
    this.#messageChannel = new MessageChannel();
    this.#messageChannel.port1.onmessage = this._onMessage.bind(this);

    this.#blockingWorker = new Worker('./blocking_demuxer_worker.js',
                                     {type: 'module'});

    this.#blockingWorker.postMessage({
        command: 'initialize',
        fileUri: this.#fileUri,
        messagePort: this.#messageChannel.port2
      },
      { transfer: [this.#messageChannel.port2] });

    // Wait to for worker to message 'initialize-done'.
    let promise = new Promise((resolver) => {this.#initResolver = resolver});
    await promise;
  }


  getDecoderConfig() {
    return this.#decoderConfig;
  }

  async getNextChunk() {
    this.#messageChannel.port1.postMessage({command: 'get-next-chunk'});

    // Wait for worker to read and send the chunk.
    let promise = new Promise((resolver) => {this.#chunkResolver = resolver});
    let chunk = await promise;

    return chunk;
  }

  _onMessage(e) {
    // console.log(`got message ${JSON.stringify(e.data)}`);

    switch (e.data.command) {
      case 'initialize-done':
        this.#decoderConfig = e.data.decoderConfig;
        console.assert(this.#initResolver != null);
        this.#initResolver();
        this.#initResolver = null;
        break;

      case 'get-next-chunk-done':
        let chunk = new EncodedAudioChunk({
          type: e.data.chunkType,
          timestamp: e.data.chunkTimestamp,
          data: e.data.chunkData
        });
        console.assert(this.#chunkResolver != null);
        this.#chunkResolver(chunk);
        this.#chunkResolver = null;
        break;

      case 'get-next-chunk-done-EOF':
        console.assert(this.#chunkResolver != null);
        this.#chunkResolver(null);
        this.#chunkResolver = null;
        break;

      default:
        console.error(`Unexpected message: ${JSON.stringify(e.data)}`);
    }
  }
}

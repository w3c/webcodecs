// Constants passed to initialize() to indicate which stream should be demuxed.
export const AUDIO_STREAM_TYPE = 0;
export const VIDEO_STREAM_TYPE = 1;


// Interface to be extended by concrete demuxer implementations.
export class PullDemuxerBase {
  
  // Starts fetching file. Resolves when enough of the file is fetched/parsed to
  // populate getDecoderConfig().
  async initialize(streamType) {}

  // Returns either an AudioDecoderConfig or VideoDecoderConfig based on the
  // streamType passed to initialize().
  getDecoderConfig() {}

  // Returns either EncodedAudioChunks or EncodedVideoChunks based on the
  // streamType passed to initialize(). Returns null after EOF.
  async getNextChunk() {}
}
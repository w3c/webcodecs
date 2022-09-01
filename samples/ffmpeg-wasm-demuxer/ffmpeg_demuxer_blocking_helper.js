import createWasmModule from './third_party/emscripten_generated/ffmpeg_wasm.out.js';
import {SharedReadBuffer} from './shared_read_buffer.js'
import {PullDemuxerBase, AUDIO_STREAM_TYPE, VIDEO_STREAM_TYPE} from '../library/pull_demuxer_base.js'

let Module = null;

export class FFmpegDemuxerBlockingHelper extends PullDemuxerBase {
  constructor(uri) {
    super();
    this.uri = uri;
    this.pPacket = null;
    this.pMicroSecondsTimeBase = null;
    this.decoderConfig = null;
    this.streamIndex = -1;
    this.pStreamTimeBase = null;
    this.pFormatContext = null;
    this.enableLogging = false;
  }

  async initialize(streamType) {
    // It would be easy to support video, but this is intended as a demo, not a
    // full featured library.
    console.assert(streamType == AUDIO_STREAM_TYPE,
                   'This demuxer currently supports audio');

    self.readTimes = [];
    let start = performance.now();
    Module = await createWasmModule();
    this._log('WASM module ready in ' + (performance.now() - start) + 'ms.');

    // TODO: try different sizes. 4KB is mentioned by avio.h as a starting point.
    const AVIO_BUFFER_SIZE = 4_000;

    let sab = SharedReadBuffer.getStorageForNumBytes(AVIO_BUFFER_SIZE);
    this.sharedReadBuffer = new SharedReadBuffer(sab);

    this.downloadWorker = new Worker('./download_worker.js', {type: 'module'});
    this.downloadWorker.postMessage({
      command: 'initialize',
      file: this.uri, sab: sab
    });

    // Wait for download worker to boot up before we start using Atomics.wait()
    // in this module. https://crbug.com/1357138
    let resolver = null;
    let downloadWorkerInit = new Promise((r) => { resolver = r; });
    this.downloadWorker.addEventListener('message', (e) => {
      console.assert(e.data.command == 'initialize-done');
      resolver();
    });
    await downloadWorkerInit;

    // Get ffmpeg logs to console for level >= AV_LOG_WARNING(24)
    Module._av_log_set_level(24);

    // Make function ptr for FFmpeg to call us back for _blocking_ reads.
    let readFuncPtr = Module.addFunction(this._read.bind(this), 'iiii');

    // Initialize an AVIOContext using our custom read operation. Don't keep
    // pointers to the buffer since FFmpeg may reallocate it on the fly. It will
    // be cleaned up.
    this.pFormatContext = Module._avformat_alloc_context();
    this.pAvioContext = Module._avio_alloc_context(
      Module._av_malloc(AVIO_BUFFER_SIZE), AVIO_BUFFER_SIZE, 0, null,
                        readFuncPtr, null, null);

    // Seeking is not supported, but would be easy to implement by provideing a
    // seek callback similar to the read callback (readFuncPtr) above.
    Module._AVIOContext_seekable_s(this.pAvioContext, 0);

    // Ensure writing is disabled.
    Module._AVIOContext_write_flag_s(this.pAvioContext, 0);

    // Tell the format context about our custom IO context. Calling
    // avformat_open_input() will set the AVFMT_FLAG_CUSTOM_IO flag for us, but
    // do so here to ensure an early error state doesn't cause FFmpeg to free
    // our resources in error. Also, enable fast, but inaccurate seeks for MP3.
    let flags = Module._CONST_AVFMT_FLAG_CUSTOM_IO() | Module._CONST_AVFMT_FLAG_FAST_SEEK();
    Module._AVFormatContext_flags_s(this.pFormatContext, flags);

    // Ensures format parsing errors will bail out. From an audit on 11/2017, all
    // instances were real failures. Solves bugs like http://crbug.com/710791.
    Module._AVFormatContext_error_recognition_s(
        this.pFormatContext, Module._CONST_AV_EF_EXPLODE());

    // format_context_->pb = avio_context_.get();
    Module._AVFormatContext_pb_s(this.pFormatContext, this.pAvioContext);

    let ppFormatContext = Module._malloc(4);
    Module.setValue(ppFormatContext, this.pFormatContext, 'i32');

    // By passing nullptr for the filename (second parameter) we are telling
    // FFmpeg to use the AVIO context we setup from the AVFormatContext
    // structure.
    let ret = Module._avformat_open_input(ppFormatContext, null, null, null);
    if (ret < 0) {
      Module._logAvError(ret);
      this._close();
      return;
    }

    // Fully initialize AVFormatContext by parsing the stream a little.
    ret = Module._avformat_find_stream_info(this.pFormatContext, null);
    if (ret < 0) {
      Module._logAvError(ret);
    }

    // Find the best audio stream.
    this.streamIndex = Module._av_find_best_stream(
        this.pFormatContext, 1 /* audio */, -1, -1, null, 0);
    if (this.streamIndex < 0) {
      Module._logAvError(ret);
      this._close();
      return;
    }
    this._log(`Chose streamIndex=${this.streamIndex}`);

    let pAVStream = Module._AVFormatContext_streams_a(this.pFormatContext,
                                                      this.streamIndex);

    // Get stream time base to convert packet timestamps to microseconds.
    this.pStreamTimeBase = Module._malloc(4);
    Module._AVStream_time_base_a(this.pStreamTimeBase, pAVStream);

    // Make decoder config!
    let pCodecPar = Module._AVStream_codecpar_a(pAVStream);
    let codecId = Module._AVCodecParameters_codec_id_a(pCodecPar);
    if (codecId != Module._CONST_AV_CODEC_ID_AAC()) {
      console.error('Codec for selected stream is not AAC');
      this._close();
      return;
    }

    // let codecProfile = Module._AVCodecParameters_profile_a(pCodecPar);
    // this._log(codecProfile);
    // Profile is unknown (-99) for AAC unless built with aac decoder.
    // TODO: Just pull it out of the MP4 private data.
    // For now, just hardcoded to AAC-LC.
    let codecString = "mp4a.40.2";
    let sampleRate = Module._AVCodecParameters_sample_rate_a(pCodecPar);
    let numberOfChannels = Module._AVCodecParameters_channels_a(pCodecPar);
    let descriptionBytes = new Uint8Array(Module.HEAPU8.buffer,
        Module._AVCodecParameters_extradata_a(pCodecPar),
        Module._AVCodecParameters_extradata_size_a(pCodecPar));
    this.decoderConfig = {
      codec: codecString,
      sampleRate: sampleRate,
      numberOfChannels: numberOfChannels,
      description: descriptionBytes
    };
  }

  getDecoderConfig() {
    if (!this.decoderConfig) {
      console.error('Call demxuer.initizlize() before getAudioDecoderConfig()');
      return;
    }

    return this.decoderConfig;
  }

  async getNextChunk() {
    if (!this.decoderConfig) {
      console.error('Call demxuer.initizlize() before readChunk()');
      return;
    }

    if (!this.pPacket)
      this.pPacket = Module._av_packet_alloc();

    let chunk = null;
    while (chunk == null) {
      let readStartTime = performance.now();
      let ret = Module._av_read_frame(this.pFormatContext, this.pPacket);
      if (ret < 0) {
        Module._logAvError(ret);
        this._close();
        return null;
      }

      let readTime = performance.now() - readStartTime;
      self.readTimes.push(readTime);
      if (self.readTimes.length % 100 == 0) {
        let maxReadTime = 0;
        let sumReadTimes = 0;
        for (let time of self.readTimes) {
          sumReadTimes += time;
          if (time > maxReadTime)
            maxReadTime = time;
        }
        let avgReadTime = sumReadTimes / self.readTimes.length;
        this._log(`read perf stats! avg=${avgReadTime}, max=${maxReadTime}`);
      }


      if (Module._AVPacket_stream_index_a(this.pPacket) != this.streamIndex)
        continue;

      // AAC chunks are always type==key. True for most audio codecs.
      // Otherwise, we could use AVPacket.flags & AV_PKT_FLAG_KEY.
      let chunkType = 'key';
      let ptsMicros = this.timeAsMicroseconds(Module._AVPacket_pts_a(this.pPacket));
      let packetBytes = new Uint8Array(Module.HEAPU8.buffer,
          Module._AVPacket_data_a(this.pPacket),
          Module._AVPacket_size_a(this.pPacket));

      chunk = new EncodedAudioChunk({
        type: chunkType,
        timestamp: ptsMicros,
        data: packetBytes
      });
    }
    return chunk;
  }

  _read(pOpaque, pBuffer, buffSize) {
    this._log(`AVIO read, buffSize=${buffSize}`);
    let heapBuffer = new Uint8Array(Module.HEAPU8.buffer, pBuffer, buffSize);
    let result = this.sharedReadBuffer.blockingRead(this.downloadWorker, heapBuffer);
    this._log(`AVIO read done. result=${result}`);
    return result;
  }

  _close() {
    if (this.pFormatContext) {
      Module._avformat_free_context(this.pFormatContext);
      this.pFormatContext = null;
    }

    if (this.pPacket) {
      let ppPacket = Module._malloc(4);
      Module.setValue(ppPacket, this.pPacket, 'i32');
      Module._av_packet_free(ppPacket);
      this.pPacket = null;
      Module._free(ppPacket);
      ppPacket = null;
    }

    if (this.pStreamTimeBase) {
      Module._free(this.pStreamTimeBase);
      this.pStreamTimeBase = null;
    }

    if (this.pMicroSecondsTimeBase) {
      Module._free(this.pMicroSecondsTimeBase);
      this.pMicroSecondsTimeBase = null;
    }
  }

  timeAsMicroseconds(timestamp) {
    console.assert(this.pStreamTimeBase);
    if (!this.pMicroSecondsTimeBase) {
      this.pMicroSecondsTimeBase = Module._malloc(4);
      Module._MicrosecondsTimeBase(this.pMicroSecondsTimeBase);
    }

    let microsBigInt = Module._av_rescale_q(
        timestamp, this.pStreamTimeBase, this.pMicroSecondsTimeBase);
    if (microsBigInt > Number.MAX_SAFE_INTEGER ||
        microsBigInt < Number.MIN_SAFE_INTEGER) {
      console.error('Cant cast packet timestamp to Number');
      return null;
    }
    return Number(microsBigInt);
  }

  _log(msg) {
    if (this.enableLogging)
      debugLog('[FFmpegDemuxerBlockingHelper]: ' + msg);
  }
}

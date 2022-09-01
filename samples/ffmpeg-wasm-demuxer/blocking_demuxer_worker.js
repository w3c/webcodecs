// The "blocking demuxer worker" is where FFmpeg demuxing actually takes place.
// Blocking occurs via Atomics.wait() within FFmpegDemuxerBlockingHelper.
// Blocking is required because FFmpeg's AVIO read callback is synchronous,
// while the data-to-be-read is being asynchronously fetched from the network.

self.debugLog = function(msg) {
    console.debug('[blocking worker]' + msg);
}

debugLog(` -- worker started`);

import {FFmpegDemuxerBlockingHelper} from './ffmpeg_demuxer_blocking_helper.js';
import {AUDIO_STREAM_TYPE} from '../library/pull_demuxer_base.js'

let blockingDemuxer = null;
let messagePort = null;

self.addEventListener('message', onMessage);

async function onMessage(e) {
  // debugLog(`Blocking demuxer worker message: ${JSON.stringify(e.data)}`);

  switch (e.data.command) {
    case 'initialize':
      // Use the message port to pass messages after initialization.
      messagePort = e.data.messagePort;
      messagePort.onmessage = onMessage;

      blockingDemuxer = new FFmpegDemuxerBlockingHelper(e.data.fileUri);
      await blockingDemuxer.initialize(AUDIO_STREAM_TYPE);

      messagePort.postMessage({
        command: 'initialize-done',
        decoderConfig: blockingDemuxer.getDecoderConfig()
      });
      break;

    case 'get-next-chunk':
      let chunk = await blockingDemuxer.getNextChunk();

      if (chunk == null) {
        console.error('FIXME! Proper EOF handling');
        return;
      }

      // TODO: Avoid this copy by making chunks transferable!
      let chunkData = new Uint8Array(chunk.byteLength);
      chunk.copyTo(chunkData);

      messagePort.postMessage({
          command: 'get-next-chunk-done',
          chunkType: chunk.type,
          chunkTimestamp: chunk.timestamp,
          chunkData: chunkData
        },
        {
          transfer: [chunkData.buffer]
        });
      break;

    default:
      console.error(`Worker bad message: ${e.data}`);
    }
}
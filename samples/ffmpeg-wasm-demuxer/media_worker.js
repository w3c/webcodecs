// The "media worker" houses and drives the AudioRenderer and VideoRenderer
// classes to perform demuxing and decoder I/O on a background worker thread.

self.debugLog = function(msg) {
  console.debug('[media worker]' + msg);
}

debugLog(` -- worker started`);

import {AudioRenderer} from "../library/audio_renderer.js";
import {FFmpegDemuxer} from './ffmpeg_demuxer.js';

let audioRenderer = null;

self.addEventListener('message', async function(e) {
  // console.info(`Worker message: ${JSON.stringify(e.data)}`);

  switch (e.data.command) {
    case 'initialize':
      let demuxer = new FFmpegDemuxer(e.data.audioFile);

      audioRenderer = new AudioRenderer();
      await audioRenderer.initialize(demuxer);
      postMessage({command: 'initialize-done',
                   sampleRate: audioRenderer.sampleRate,
                   channelCount: audioRenderer.channelCount,
                   sharedArrayBuffer: audioRenderer.ringbuffer.buf});
      break;
    case 'play':
      audioRenderer.play();
      break;
    case 'pause':
      audioRenderer.pause();
      break;
    default:
      console.error(`Unexpected message: ${e.data}`);
  }

});

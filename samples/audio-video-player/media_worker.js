// The "media worker" houses and drives the AudioRenderer and VideoRenderer
// classes to perform demuxing and decoder I/O on a background worker thread.
console.info(`Worker started`);

// Ideally we would use the static import { module } from ... syntax for this
// and the modules below. But presently mp4box.js does not use ES6 modules,
// so we import it as an old-style script and use the dynamic import() to load
// our modules below.
importScripts('../third_party/mp4boxjs/mp4box.all.min.js');
let moduleLoadedResolver = null;
let modulesReady = new Promise(resolver => (moduleLoadedResolver = resolver));
let playing = false;
let audioRenderer = null;
let videoRenderer = null;
let lastMediaTimeSecs = 0;
let lastMediaTimeCapturePoint = 0;

(async () => {
    let audioImport = import('./audio_renderer.js');
    let videoImport = import('./video_renderer.js');
    Promise.all([audioImport, videoImport]).then((modules) => {
      audioRenderer = new modules[0].AudioRenderer();
      videoRenderer = new modules[1].VideoRenderer();
      moduleLoadedResolver();
      moduleLoadedResolver = null;
      console.info('Worker modules imported');
    })
})();

function updateMediaTime(mediaTimeSecs, capturedAtHighResTimestamp) {
  lastMediaTimeSecs = mediaTimeSecs;
  // Translate into Worker's time origin
  lastMediaTimeCapturePoint =
    capturedAtHighResTimestamp - performance.timeOrigin;
}

// Estimate current media time using last given time + offset from now()
function getMediaTimeMicroSeconds() {
  let msecsSinceCapture = performance.now() - lastMediaTimeCapturePoint;
  return ((lastMediaTimeSecs * 1000) + msecsSinceCapture) * 1000;
}

self.addEventListener('message', async function(e) {
  await modulesReady;

  console.info(`Worker message: ${JSON.stringify(e.data)}`);

  switch (e.data.command) {
    case 'initialize':
      let audioReady = audioRenderer.initialize(e.data.audioFile);
      let videoReady = videoRenderer.initialize(e.data.videoFile, e.data.canvas);
      await Promise.all([audioReady, videoReady]);
      postMessage({command: 'initialize-done',
                   sampleRate: audioRenderer.sampleRate,
                   channelCount: audioRenderer.channelCount,
                   sharedArrayBuffer: audioRenderer.ringbuffer.buf});
      break;
    case 'play':
      playing = true;

      updateMediaTime(e.data.mediaTimeSecs,
                      e.data.mediaTimeCapturedAtHighResTimestamp);

      audioRenderer.play();

      self.requestAnimationFrame(function renderVideo() {
        if (!playing)
          return;
        videoRenderer.render(getMediaTimeMicroSeconds());
        self.requestAnimationFrame(renderVideo);
      });
      break;
    case 'pause':
      playing = false;
      audioRenderer.pause();
      break;
    case 'update-media-time':
      updateMediaTime(e.data.mediaTimeSecs,
                      e.data.mediaTimeCapturedAtHighResTimestamp);
      break;
    default:
      console.error(`Worker bad message: ${e.data}`);
  }

});

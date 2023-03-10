import { VIDEO_STREAM_TYPE } from "./pull_demuxer_base.js";
import { MP4PullDemuxer } from "../audio-video-player/mp4_pull_demuxer.js";

const FRAME_BUFFER_TARGET_SIZE = 3;
const ENABLE_DEBUG_LOGGING = false;

function debugLog(msg) {
  if (!ENABLE_DEBUG_LOGGING)
    return;
  console.debug(msg);
}

// Controls demuxing and decoding of the video track, as well as rendering
// VideoFrames to canvas. Maintains a buffer of FRAME_BUFFER_TARGET_SIZE
// decoded frames for future rendering.
export class VideoRenderer {
  async initialize(demuxer, canvas) {
    this.frameBuffer = [];
    this.fillInProgress = false;

    this.demuxer = demuxer;
    await this.demuxer.initialize(VIDEO_STREAM_TYPE);
    const config = this.demuxer.getDecoderConfig();

    this.canvas = canvas;
    this.canvas.width = config.displayWidth;
    this.canvas.height = config.displayHeight;
    this.canvasCtx = canvas.getContext('2d');

    this.decoder = new VideoDecoder({
      output: this.bufferFrame.bind(this),
      error: e => console.error(e),
    });

    let support = await VideoDecoder.isConfigSupported(config);
    console.assert(support.supported);
    this.decoder.configure(config);

    this.init_resolver = null;
    let promise = new Promise((resolver) => this.init_resolver = resolver );

    this.fillFrameBuffer();
    return promise;
  }

  render(timestamp) {
    debugLog('render(%d)', timestamp);
    let frame = this.chooseFrame(timestamp);
    this.fillFrameBuffer();

    if (frame == null) {
      console.warn('VideoRenderer.render(): no frame ');
      return;
    }

    this.paint(frame);
  }

  chooseFrame(timestamp) {
    if (this.frameBuffer.length == 0)
      return null;

    let minTimeDelta = Number.MAX_VALUE;
    let frameIndex = -1;

    for (let i = 0; i < this.frameBuffer.length; i++) {
      let time_delta = Math.abs(timestamp - this.frameBuffer[i].timestamp);
      if (time_delta < minTimeDelta) {
        minTimeDelta = time_delta;
        frameIndex = i;
      } else {
        break;
      }
    }

    console.assert(frameIndex != -1);

    if (frameIndex > 0)
      debugLog('dropping %d stale frames', frameIndex);

    for (let i = 0; i < frameIndex; i++) {
      let staleFrame = this.frameBuffer.shift();
      staleFrame.close();
    }

    let chosenFrame = this.frameBuffer[0];
    debugLog('frame time delta = %dms (%d vs %d)', minTimeDelta/1000, timestamp, chosenFrame.timestamp)
    return chosenFrame;
  }

  async fillFrameBuffer() {
    if (this.frameBufferFull()) {
      debugLog('frame buffer full');

      if (this.init_resolver) {
        this.init_resolver();
        this.init_resolver = null;
      }

      return;
    }

    // This method can be called from multiple places and we some may already
    // be awaiting a demuxer read (only one read allowed at a time).
    if (this.fillInProgress) {
      return false;
    }
    this.fillInProgress = true;

    while (this.frameBuffer.length < FRAME_BUFFER_TARGET_SIZE &&
            this.decoder.decodeQueueSize < FRAME_BUFFER_TARGET_SIZE) {
      let chunk = await this.demuxer.getNextChunk();
      this.decoder.decode(chunk);
    }

    this.fillInProgress = false;

    // Give decoder a chance to work, see if we saturated the pipeline.
    setTimeout(this.fillFrameBuffer.bind(this), 0);
  }

  frameBufferFull() {
    return this.frameBuffer.length >= FRAME_BUFFER_TARGET_SIZE;
  }

  bufferFrame(frame) {
    debugLog(`bufferFrame(${frame.timestamp})`);
    this.frameBuffer.push(frame);
  }

  paint(frame) {
    this.canvasCtx.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
  }
}

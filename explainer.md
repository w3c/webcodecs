
# WebCodecs Explainer

## Problem and Motivation

There are many Web APIs that use media codecs internally to support APIs for particular uses:
- HTMLMediaElement and Media Source Extensions
- WebAudio (decodeAudioData)
- MediaRecorder
- WebRTC

But there’s no general way to flexibly configure and use these media codecs. Because of this, many web applications have resorted to implementing media codecs in JavaScript or WebAssembly, despite the disadvantages:
- Increased bandwidth to download codecs already in the browser.
- Reduced performance
- Reduced power efficiency

They do so perhaps because each particular Web API that has codecs internally has limitations that are difficult for certain use cases:
- WebAudio allows decoding a media file (in the form of a binary buffer) into PCM, but it needs to be a media file that is valid and complete. It does not support streaming of the data. It does not offer progress information. There is of course no support for video, and no support for encoding.
- MediaRecorder allows encoding a MediaStream that has audio and video tracks. There is crude control over some parameters (bits per second, mimetype with codec string), but it’s very high level. It does not support faster-than-realtime encoding. Not suitable for low latency encoding as the output can be buffered.  Encoded bitstream is wrapped in a container which adds overhead for use cases which need their own container format. A number of things are unclear: what happens during under-runs, what happens when the encoding speed is too slow for real-time. It’s very nice for basic uses, but lacks a lot of features.
- WebRTC PeerConnection allows encoding and decoding of network RTP streams, and has high coupling to other WebRTC and MediaStream APIs, it can’t be used realistically for anything else. It is also very opaque.  JavaScript cannot access the encoded data.
- HTMLMediaElement and Media Source Extensions allow decoding media in real time, while streaming compressed data. There is very little flexibility on the video and audio output (canvas can be used to adjust the video, but it’s not very efficient).  There is very little control over the speed of decoding, the only possibility is via playbackRate, which applies pitch compensation to the audio. There is no way to be notified that a new image has been decoded, no way to decide how much to decode in advance. There is no way to decode image data as fast as the host can and run computation on the data. Encoded bitstream must be given in a specific container format which adds overhead for use cases which have their own container format not native to the browser.


## Goals

Provide web apps with efficient access to built-in (software and hardware) media encoders and decoders for encoding and decoding media with the following properties:
- **Streamability**: the ability to operate on a stream of data, that is not necessarily all in memory (possibly on the network, possibly on disk, etc.).
- **Efficiency**: the ability to leverage the UA, the system and/or hardware available on the host to make the decoding or encoding process more efficient. Limit the amount of garbage (in the “garbage collection” sense), to limit GC pressure to a minimum, to avoid the inherent non-determinism brought in by the GCs.  Allow encoding and decoding to run off the main thread
- **Composability**: Work well with other Web APIs, such as Streams, WebTransport and WebAssembly.
- **Resilience**: the ability to recover in case of problems (network underruns, frame drop because resources are missing, etc.)
- **Flexibility**: the ability to use this API for all use cases (hard real-time, soft real-time, non-real-time).  Possibly to implement something like MSE or WebRTC on top with the same battery life and latency.
- **Symmetry**: have similar patterns for encoding and decoding

## Non-goals

- Direct APIs for media containers (muxers/demuxers)
- Writing codecs in JavaScript or WebAssembly


## Key use-cases

- Extremely low latency live streaming (< 3s delay)
- Cloud gaming
- Live stream uploading
- Non-realtime encoding/decoding/transcoding, such as for local file editing
- Advanced Real-time Communications:
  - e2e encryption
  - control over buffer behavior
  - spatial and temporal scalability
- Decoded and encoding images
- Re-encoding multiple input media streams in order to merge many encoded media streams into one encoded media stream.


## Proposed solutions

The WebCodecs interface is modeled on well known platform and software codec APIs. This API shape is time-tested and intuitive for authors with experience in developing media applications.

Core interfaces include

-   **EncodedAudioChunks** and **EncodedVideoChunks** contain codec-specific encoded media bytes.

-   **AudioFrame** contains decoded audio data. It will provide an [AudioBuffer](https://webaudio.github.io/web-audio-api/#audiobuffer) for rendering via [AudioWorklet](https://webaudio.github.io/web-audio-api/#audioworklet).

-   **VideoFrame** contains decoded video data. It will provide an [ImageBitmap](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#imagebitmap) for manipulating in WebGL, including rendering to Canvas. It should eventually also [provide access to YUV data](https://github.com/w3c/webcodecs/issues/30), but the design is still TBD.

-   An **AudioEncoder** encodes AudioFrames to produce EncodedAudioChunks.

-   A **VideoEncoder** encodes VideoFrames to produce EncodedVideoChunks.

-   An **AudioDecoder** decodes EncodedAudioChunks to produce AudioFrames.

-   A **VideoDecoder** decodes EncodedVideoChunks to produce VideoFrames.


WebCodecs will also define mechanisms for importing content from getUserMedia().

-   An [**MediaStreamTrackProcessor**](https://w3c.github.io/mediacapture-transform/#track-processor) converts an audio/video MediaStreamTrack into a ReadableStream of AudioFrame/VideoFrame. 

## Examples
### Example of video rendering to Canvas for extremely low-latency streaming (e.g. cloud gaming)

```javascript
// The app provides error handling.
function onDecoderError(error) { ... }

// App provides stream of encoded chunks to decoder.
function streamEncodedChunks(decodeCallback) { ... }

// The document contains a canvas for displaying VideoFrames.
const canvasElement = document.getElementById("canvas");
const canvasContext = canvas.getContext('2d', canvasOptions)

// Paint every video frame ASAP for lowest latency.
function paintFrameToCanvas(videoFrame) {
  // VideoFrame is a CanvasImageSource.
  // See https://github.com/web-platform-tests/wpt/blob/master/webcodecs/videoFrame-drawImage.any.js for more examples.
  //
  // Alternaviely, paint using tex(Sub)Image(2D|3D).
  // See https://github.com/web-platform-tests/wpt/blob/master/webcodecs/videoFrame-texImage.any.js for more examples.
  canvasContext.drawImage(frame, 0, 0);
  
  // IMPORTANT: Release the frame to avoid stalling the decoder.
  frame.close();
}

const videoDecoder = new VideoDecoder({
  output: paintFrameToCanvas,
  error: onDecoderError
});

videoDecoder.configure({codec: 'vp8'}).then(() => {
  // The app fetches VP8 chunks, feeding each chunk to the decode
  // callback as fast as possible. Real apps must also monitor
  // decoder backpressure to ensure the decoder is keeping up.
  streamEncodedChunks(videoDecoder.decode.bind(videoDecoder));
}).catch(() => {
  // App provides fallback logic when config not supported.
  ...
});

```

### Example of encode for live streaming upload

```javascript
// The app provides sources of audio and video, perhaps from getUserMedia.
const {audioTrack, videoTrack} = ...;

// The app provides a way to serialize/containerize encoded media and upload it.
// The browser provides the app byte arrays defined by a codec such as vp8 or opus
// (not in a media container such as mp4 or webm).
function muxAndSend(encodedChunk) { ... };

// The app provides error handling (e.g. shutdown w/ UI message)
function onEncoderError(error) { ... }

// Helper to feed raw media to encoders as fast as possible.
function readAndEncode(reader, encoder) {
  reader.read().then((result) => {
    // App handling for stream closure.
    if (result.done)
      return;

    // Encode!
    encoder.encode(result.value);

    // Keep reading until the stream closes.
    readAndEncode(reader, encoder);
  }
}

// First, the tracks are converted to ReadableStreams of unencoded audio and video.
// See https://w3c.github.io/mediacapture-transform/#track-processor.
const audio = (new MediaStreamTrackProcessor(audioTrack)).readable;
const video = (new MediaStreamTrackProcessor(videoTrack)).readable;

// Then build and configure the encoders.
const audioEncoder = new AudioEncoder({
  output: muxAndSend,
  error: onEncoderError,
});
const audioPromise = audioEncoder.configure({
  codec: 'opus',
  tuning: {
    bitrate: 60_000,
  }
});
const videoEncoder = new VideoEncoder({
  output: muxAndSend,
  error: onEncoderError,
});
const videoPromise = videoEncoder.configure({
  codec : 'vp8',
  tuning: {
    bitrate: 1_000_000,
    framerate: 24,
    width: 1024,
    height: 768
  }
});

try {
  let values = await Promise.all([audioPromise, videoPromise]);
} catch (exception) {
  // Configuration not supported. More elaborate fallback recommended.
  return;
}

// Finally, feed the encoders data from the track readers.
readAndEncode(audio.getReader(), audioEncoder);
readAndEncode(video.getReader(), videoEncoder);
```

### Example of transcoding or offline encode/decode

```javascript
// App demuxes (decontainerizes) input and makes repeated calls to the provided
// callbacks to feed the decoders.
function streamEncodedChunks(decodeAudioCallback, decodeVideoCallback) { ... }

// App provides a way to demux  and mux (containerize) media.
function muxAudio(encodedChunk) { ... }
function muxVideo(encodedChunk) { ... }

// The app provides error handling (e.g. shutdown w/ UI message)
function onCodecError(error) { ... }

// Returns an object { audioEncoder, videoEncoder }.
// Encoded outputs sent immediately to app provided muxer.
async function buildAndConfigureEncoders() {
  // Build encoders.
  let audioEncoder = new AudioEncoder({ output: muxAudio, error: onCodecError });
  let videoEncoder = new VideoEncoder({ output: muxVideo, error: onCodecError });

  // Configure and reset if not supported. More sophisticated fallback recommended.
  try {
    await audioEncoder.configure({ codec: 'opus', ... });
  } catch (exception) {
    audioEncoder = null;
  }
  try {
    await videoEncoder.configure({ codec : 'vp8', ... });
  } catch (exception) {
    videoEncoder = null;
  }

  return { audioEncoder: audioEncoder, videoEncoder: videoEncoder };
}

// Returns an object { audioDecoder, videoDecoder }.
// Decoded outputs sent immediately to the coresponding encoder for re-encoding.
async function buildAndConfigureDecoders(audioEncoder, videoEncoder) {
  // Bind encode callbacks.
  const reEncodeAudio = audioEncoder.encode.bind(audioEncoder);
  const reEncodeVideo = videoEncode.encode.bind(videoEncoder);

  // Build decoders.
  const audioDecoder = new AudioDecoder({ output: reEncodeAudio, error: onCodecError });
  const videoDecoder = new VideoDecoder({ output: reEncodeVideo, error: onCodecError });

  // Configure and reset if not supported. More sophisticated fallback recommended.
  try {
    await audioDecoder.configure({ codec: 'aac', ... });
  } catch (exception) {
    audioDecoder = null;
  }
  try {
    await videoDecoder.configure({ codec : 'avc1.42001e', ... });
  } catch (exception) {
    videoDecoder = null;
  }

  return { audioDecoder: audioDecoder, videoDecoder: videoDecoder};
}

// Setup encoders.
let { audioEncoder, videoEncoder } = await buildAndConfigureEncoders();

// App handles unsupported configuration.
if (audioEncoder == null || videoEncoder == null)
  return;

// Setup decoders. Provide encoders to receive decoded output.
let { audioDecoder, videoDecoder } = await buildAndConfigureDecoders(audioEncoder, videoEncoder);

// App handles unsupported configuration.
if (audioDecoder == null || videoDecoder == null)
  return;

// Start streaming encoded chunks to the decoders, repeatedly calling
// the provided callbacks for each chunk.
// Decoded output will be fed to encoders for re-encoding.
// Encoded output will be fed to muxer.
streamEncodedChunks(audioDecoder.decode.bind(audioDecoder),
          videoDecoder.decode.bind(videoDecoder));
```

### Example of real-time communication

```javascript
// The app provides sources of audio and video, perhaps from getUserMedia().
const {audioTrack, videoTrack} = ...;
// The app also provides ways to send encoded audio and video bitstream.
function sendAudio(encodedAudio) { ... };
function sendVideo(encodedVideo) { ... };

// On the receive side, encoded media is likely received
// from an out-of-order p2p transport and then put into a buffer.
// The output of that buffer is the source of encoded audio and video here.
function streamEncodedChunks(decodeAudioCallback, decodeVideoCallback) { ... }

// App rendering audio in AudioWorklet
// TODO(chcunningham): source a demo.
function renderInAudioWorklet(audioFrame) { ... }

// See definition from earlier example.
function paintFrameToCanvas(videoFrame) { ... }

// Returns an object { audioEncoder, videoEncoder }.
// Encoded outputs sent immediately to app provided muxer.
async function buildAndConfigureEncoders() {
    // Encoded outputs immmediately sent on the wire.
  let audioEncoder = new AudioEncoder({ output: sendAudio, error: onCodecError });
  let videoEncoder = new VideoEncoder({ output: sendVideo, error: onCodecError });

  // Rest matches earlier example.
  ...
}

// Returns an object { audioDecoder, videoDecoder }.
// Decoded outputs rendered immediately.
async function buildAndConfigureDecoders(audioEncoder, videoEncoder) {
  // Build decoders.
  const audioDecoder = new AudioDecoder({ output: paintToCanvas, error: onCodecError });
  const videoDecoder = new VideoDecoder({ output: renderInAudioWorklet, error: onCodecError });

  // Rest matches earlier example.
  ...
}

// Setup the encoders and check for unsupported configuration.
let { audioEncoder, videoEncoder } = buildAndConfigureEncoders();
if (audioEncoder == null || videoEncoder == null)
  return;  // More elaborate fallback recommended.

// Convert the camera tracks to ReadableStreams of AudioFrame and VideoFrame.
// See https://w3c.github.io/mediacapture-transform/#track-processor
const audio = (new MediaStreamTrackProcessor(audioTrack)).readable;
const video = (new MediaStreamTrackProcessor(videoTrack)).readable;

// Feed the encoders data from the track readers. Encoded outputs are
// immediately sent on the wire. See readAndEncode() definition from
// earlier examples.
readAndEncode(audio.getReader(), audioEncoder);
readAndEncode(video.getReader(), videoEncoder);

// Setup decoders and check for unsupported configuration.
let { audioDecoder, videoDecoder } = buildAndConfigureDecoders();
if (audioDecoder == null || videoDecoder == null)
  return;  // More elaborate fallback recommended.

// Start streaming encoded data, repeatedly calling decode callbacks for each chunk.
streamEncodedChunks(audioDecoder.decode.bind(audioDecoder),
          videoDecoder.decode.bind(videoDecoder));
```

### Example of real-time communication using SVC

The same as above, but with fancier codec parameters:

```javascript
videoEncoder.configure({
  codec : 'vp9',
  tuning: {
    bitrate: 1_000_000,
    framerate: 24,
    width: 1024,
    height: 768
  }
  // Two spatial layers with two temporal layers each
  layers: [{
      // Quarter size base layer
      id: 'p0',
      temporalSlots: [0],
      scaleDownBy: 2,
      dependsOn: ['p0'],
    }, {
      id: 'p1'
      temporalSlots: [1],
      scaleDownBy: 2,
      dependsOn: ['p0'],
    }, {
      id: 's0',
      temporalSlots: [0],
      dependsOn: ['p0', 's0'],
    }, {
      id: 's1',
      temporalSlots: [1],
      dependsOn: ['p1', 's0', 's1'],
    }],
});
```

## Detailed design discussion

### Execution environment

Encoder and decoder objects can be instantiated on the main thread and on dedicated workers. Codec inputs and outputs can be transferred between contexts using postMessage(). Transfer serialization will be implemented with move semantics and avoid copies.

Encode and decode operations can be very computationally expensive. As such, user agents must perform the operations asynchronously with the JavaScript which initiates the operation. The execution environment of the codec implementation is defined by the user agent. Some possibilities include: sequentially or in parallel on an internal thread pool, or on a hardware acceleration unit (e.g., a GPU).

The user agent should take great care to efficiently handle expensive resources (e.g., video frame contents, GPU resource handles).

### Codec configuration

Many codecs and encoder/decoder implementations are highly configurable. WebCodecs intends to support most of the configuration options available in codecs today to efficiently allow for advanced use cases.

Configurations consist of (1) metadata required to construct a compliant bitstream (for example, the codec name and profile) as well as (2) settings that influence the behavior of the codec but do not change the type of bitstream produced (for example, the target bitrate). The codec may be reconfigured at any time while the codec state is not "closed". Chunks/Frames passed to decode() or encode() will be decoded/encoded according to most recent preceeding call to configure(). 

WebCodecs will maintain a standard definition of parameters for each supported codec. Additionally, the specification will establish common encoder settings that apply across codecs and implementation. However, we expect many settings will be implementation-specific. Supported configurations may be feature-detected using the static IsConfigSupported() methods.

## Alternative designs considered

### Media Source Extensions (MSE)

MSE is already used widely for low-latency streaming.  However, there are some problems:
- The way to trigger "low-latency mode" is implicit, not standardized, and not supported by all major browsers
- Applications must work around the default "stop on underrun" behavior of MSE.
- Applications must containerize input before adding it to the buffer
- Applications that do not want history for seeking (cloud gaming) must work to remove/disable it.
- Applications do not have easy access to the decoded output (for uses other than rendering, such a transcoding).
All of these things could be fixed by adding expanding the MSE API to explicitly support low-latency controls. But this would only solve decode side of the equation, not the encode side.

### Integrating with WhatWG Streams

An earlier design defined Encoders and Decoders as TrasformStreams from the WhatWG Streams specification. This is an appealing model; codecs are conceptually transformers with a stream of inputs and outputs. But implementing basic codec controls (configure, flush, reset) on top of Streams led to complicated designs and we were not able to hide that complexity from users (more details [here](https://docs.google.com/document/d/10S-p3Ob5snRMjBqpBf5oWn6eYij1vos7cujHoOCCCAw/edit?usp=sharing)). We've opted to instead define the codec interfaces as described above. Users can wrap these interfaces in Streams when desired.

## Future considerations

Earlier proposals defined AudioTrackWriter and VideoTrackWriter as a means of feeding decoded media to `<video>` for presentation. Most prospective users have indicated they prefer to manage presentation via Canvas, so `<video>` presentation has been deprioritized for now.

Another future idea is to expose a codec "worklet", where users could implement their own codec for use inside the existing media pipeline. For example, a WASM decoder could be used in combination with existing MSE and `<video>` APIs.

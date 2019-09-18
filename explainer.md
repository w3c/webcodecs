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
- **Clocking**: the ability to drive the decoding or encoding using a specific clock domain, to be able to control clock drifts
- **Efficiency**: the ability to leverage the UA, the system and/or hardware available on the host to make the decoding or encoding process more efficient. Limit the amount of garbage (in the “garbage collection” sense), to limit GC pressure to a minimum, to avoid the inherent non-determinism brought in by the GCs.  Allow encoding and decoding to run off the main thread
- **Composability**: Work well with other Web APIs, such as Streams, WebTransport and WebAssembly.
- **Resilience**: the ability to recover in case of problems (network underruns, frame drop because resources are missing, etc.)
- **Flexibility**: the ability to use this API for all use cases (hard real-time, soft real-time, non-real-time).  Possibly to implement something like MSE or WebRTC on top with the same battery life and latency.
- **Symmetry**: have similar patterns for encoding and decoding

## Non-goals

- Direct APIs for media containers (muxers/demuxers)
- Writing codecs in JavaScript or WebAssembly


## Key use-cases

- Extremely low latency live streaming (<3s delay)
- Cloud gaming
- Live stream uploading
- Non-realtime encoding/decoding/transcoding, such as for local file editing
- Advanced Real-time Communications: 
  - e2e encryption
  - control over buffer behavior
  - spatial and temporal scalability
- Decoded and encoding images
- Reencoding multiple input media streams in order to merge many encoded media streams into one encoded media stream.


## Proposed solutions

We build on top of [WHATWG Streams](https://streams.spec.whatwg.org/) (in particular [TransformStreams](https://streams.spec.whatwg.org/#ts-class)) and [MediaStreamTracks](https://www.w3.org/TR/mediacapture-streams/#dom-mediastreamtrack).

**EncodedAudioPacket**s and **EncodedVideoFrame**s provide access to codec-specific encoded media bytes so they may be transported, saved, etc.

**DecodedAudioPacket**s and **DecodedVideoFrame**s provide opaque handles for passing to/from other APIs (such as to/from MediaStreamTracks).   

An **AudioTrackReader** converts a MediaStreamTrack into a ReadableStream of DecodedAudioPacket.

An **AudioEncoder** is a TransformStream from DecodeAudioPacket to EncodedAudioPacket.

An **AudioDecoder** is a TransformStream from EncodedAudioPacket to DecodedAudioPacket.

An **AudioTrackWriter** converts a WritableStream of DecodedAudioPacket into a MediaStreamTrack.

A **VideoTrackReader** converts a MediaStreamTrack into a ReadableStream of DecodedVideoFrame.

A **VideoEncoder** is a TransformStream from DecodeVideoFrame to EncodedVideoFrame.

A **VideoDecoder** is a TransformStream from EncodedVideoFrame to DecodedVideoFrame.

A **VideoTrackWriter** converts a WritableStream of DecodedVideoFrame into a MediaStreamTrack.

## Examples
### Example of decode for low-latency live streaming or cloud gaming 

```javascript
// The app provides ReadableStreams of encoded audio and video
// in the form of byte arrays defined by a codec such as vp8 or opus
// (not in a media container such as mp4 or webm).
const {encodedAudio, encodedVideo} = ...;
// The app also provides an element to render the decoded media
const videoElem = ...;

// To render to an element, the ReadableStream of decoded audio and video
// must be converted to a MediaStream using TrackWriters.
const videoWriter = new VideoTrackWriter();
const audioWriter = new AudioTrackWriter();
videoElem.srcObject = new MediaStream([audioWriter.track, videoWriter.track]);

// Finally the decoders are created and the encoded media is piped through the decoder
// and into the TrackerWriters which converts them into MediaStreamTracks.
const audioDecoder = new AudioDecoder({codec: 'opus'});
const videoDecoder = new VideoDecoder({codec: 'vp8'});
encodedAudio.pipeThrough(audioDecoder).pipeTo(audioWriter.writable);
encodedVideo.pipeThrough(videoDecoder).pipeTo(videoWriter.writable);
```

### Example of encode for live streaming upload

```javascript
// The app provides sources of audio and video, perhaps from getUserMedia.
const {audioTrack, videoTrack} = ...;
// The app also provides a way to serialize/containerize encoded media and upload it.
// The browser provides the app byte arrays defined by a codec such as vp8 or opus
// (not in a media container such as mp4 or webm).
function muxAndSend(encodedAudio, encodedVideo) { ... };

// First, the tracks are converted to ReadableStreams of unencoded audio and video.
const audio = (new AudioTrackReader(audioTrack)).readable;
const video = (new VideoTrackReader(videoTrack)).readable;

// Lastly, build the encoders and pass media through them.
const audioEncoder = new AudioEncoder({
  codec: 'opus',
  settings: {
    targetBitRate: 60_000,
  },
});
const videoEncoder = new VideoEncoder({
  codec: 'vp8', 
  settings: {
    targetBitRate: 1_000_000
  },
});
// TODO: Example of putting dynamic settings in media flow
const encodedAudio = audio.pipeThrough(audioEncoder);
const encodedVideo = video.pipeThrough(videoEncoder);

muxAndSend(encodedAudio, encodedVideo);
```

### Example of transcoding or offline encode/decode

```javascript
// App provides a way to demux (decontainerize) and mux (containerize) media.
function demux(input) { ... }
function mux(audio, video) { ... }
const input = ...;

const audioDecoder = new AudioDecoder({codec: 'aac'});
const videoDecoder = new VideoDecoder({codec: 'h264'});

const audioEncoder = new AudioEncoder({
  codec: 'opus', 
  settings: {
    targetBitRate: 60_000,
  },
});
const videoEncoder = new VideoEncoder({
  codec: 'vp8',
  settings: {
    bitsPerSecond: 1_000_000,
  },
});

const {audioIn, videoIn} = demux(input);
const audioOut = audioIn.pipeThrough(audioDecoder).pipeThrough(audioEncoder);
const videoOut = videoIn.pipeThrough(videoDecoder).pipeThrough(videoEncoder);
const output = mux(audioOut, videoOut);

```

### Example of real-time communication

```javascript
// The app provides sources of audio and video, perhaps from getUserMedia.
const {audioTrack, videoTrack} = ...;
// The app also provides ways to send encoded audio and video bitstream.
function sendMedia(encodedAudio, encodedVideo) { ... };

// First, the tracks are converted to ReadableStreams of framed bitstream chunks.
const audio = (new AudioTrackReader(audioTrack)).readable;
const video = (new VideoTrackReader(videoTrack)).readable;

// Next, build the encoders and pass media through them
const audioEncoder = new AudioEncoder({
  codec: 'opus',
  settings: {
    targetBitRate: 60_000,
  },
});
const videoEncoder = new VideoEncoder({
  codec: 'vp8',
  settings: {
    bitsPerSecond: 1_000_000,
  },
});
// TODO: Example of putting dynamic settings in media flow
const encodedAudio = audio.pipeThrough(audioEncoder);
const encodedVideo = video.pipeThrough(videoEncoder);

// Then send the encoded audio and video
sendMedia(encodedAudio, encodedVideo);

// On the receive side, encoded media is likely received
// from an out-of-order p2p transport and then put into a buffer.
// The output of that buffer is the source of encoded audio and video here.
const {encodedAudio, encodedVideo} = ...;

// To render to an element, the ReadableStream of decoded audio and video
// must be converted to a MediaStream using TrackWriters.
const videoWriter = new VideoTrackWriter();
const audioWriter = new AudioTrackWriter();
videoElem.srcObject = new MediaStream([audioWriter.track, videoWriter.track]);

// Finally the decoders are created and the encoded media is piped through the decoder
// and into the TrackerWriters which converts them into MediaStreamTracks.
const audioDecoder = new AudioDecoder({codec: 'opus'});
const videoDecoder = new VideoDecoder({codec: 'vp8'});
encodedAudio.pipeThrough(audioDecoder).pipeTo(audioWriter.writable);
encodedVideo.pipeThrough(videoDecoder).pipeTo(videoWriter.writable);
```

### Example of real-time communication using SVC

The same as above, but with fancier codec parameters:

```javascript
const videoEncoder = new VideoEncoder({
  codec: 'vp9',
  settings: {
    bitsPerSecond: 1_000_000,
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
  },
});
```

## Detailed design discussion

### Execution environment

Encoder and decoder objects can be instantiated on the main thread and on dedicated workers. Additionally, the ReadableStream and WritableStream components of each object can be transferred to other contexts (utilizing the [transferable stream][transferable-streams] infrastructure).

Encode and decode operations can be very computationally expensive. As such, user agents must perform the operations asynchronously with the JavaScript which initiates the operation. The execution environment of the codec implementation is defined by the user agent. Some possibilities include: sequentially or in parallel on an internal thread pool, or on a hardware acceleration unit (e.g., a GPU).

By building on the Streams infrastructure, WebCodecs allows the user agent to optimize the transfer of chunks between JavaScript and internal execution environments. The user agent should take great care to efficiently handle expensive resources (e.g., video frame contents, GPU resource handles).

[transferable-streams]: https://github.com/whatwg/streams/blob/master/transferable-streams-explainer.md

### Codec configuration

Many codecs and encoder/decoder implementations are highly configurable. WebCodecs intends to support most of the configuration options available in codecs today to efficiently allow for advanced use cases.

Configuration options are classified into two types:
- **Parameters** are metadata required to construct a compliant bitstream. These are required when constructing the encoder/decoder and cannot be changed. For example, the VP9 profile.
- **Settings** are configuration options that influence the behavior of the encoder but do not change the type of bitstream produced. For example, target bitrate.

Settings are further classified into two types:
- **Static settings** must be specified when constructing the encoder and cannot be changed without reinitializing the encoder.
- **Dynamic settings** apply to the lifetime of the encoder and can be changed at any point. Dynamic settings must be lightweight and not require reinitializing the encoder (concretely, does not require a new key frame to be produced).

WebCodecs will maintain a standard definition of parameters for each supported codec. Additionally, the specification will establish common encoder settings that apply across codecs and implementation. However, we expect many settings will be implementation-specific. These will be available behind a feature detection and configuration API (TODO: sketch this).

#### Configuration examples

Both encoder and decoder constructors take in the codec name and required parameters. Encoders additionally take in a dictionary of codec settings.

```javascript
const encoder = new VideoEncoder({
  codec: 'VP9',
  profile: '1',
  settings: {
    targetBitRate: 80_000,
  },
});
```

Codec settings can be changed on-the-fly by bundling the changed settings with the next media chunk. The changed settings will be applied before encoding chunk and apply to subsequent chunks.

```javascript
const encoder = new VideoEncoder(...);
const writer = encoder.writable.getWriter();
writer.write({
  imageData: ...,
  timestamp: ...,
  changeSettings: {
    targetBitRate: 50_000,
  },
});
```

```javascript
const encoder = new VideoEncoder(...);
const writer = encoder.writable.getWriter();
writer.write({
  imageData: ...,
  timestamp: ...,
  changeSettings: {
    // |imageData| or the next compatible image will be encoded as a key frame.
    requestKeyFrame: true,
  },
});
```

## Alternative designs considered

Media Source Extensions (MSE) is already used widely for low-latency streaming.  However, there are some problems:
- The way to trigger "low-latency mode" is implicit, not standardized, and not supported by all major browsers
- Applications must work around the default "stop on underrun" behavior of MSE.
- Applications must containerize input before adding it to the buffer
- Applications that do not want history for seeking (cloud gaming) must work to remove/disable it.
- Applications do not have easy access to the decoded output (for uses other than rendering, such a transcoding).

All of these things could be fixed by adding expanding the MSE API to explicitly support low-latency controls.

But the would only solve decode side of the equation, not the encode side.

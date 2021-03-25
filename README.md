# Try it out in Chrome 86

Please see [this doc for current limitations](https://docs.google.com/document/d/1H1UHn3DIw-LOfBUdNUFR6l2-zSipXuHCVmhrwF3rR6w/edit).

To try it on your machine, either
* enable `chrome://flags/#enable-experimental-web-platform-features`, or 
* pass `--enable-blink-features=WebCodecs` flag via the command line.

To try it with real users, [sign up for the origin trial here](
https://developers.chrome.com/origintrials/#/register_trial/-7811493553674125311).

# WebCodecs

The [WebCodecs API](https://w3c.github.io/webcodecs/) allows web applications
to encode and decode audio and video.

Many Web APIs use media codecs internally to support APIs for particular uses:
- HTMLMediaElement and Media Source Extensions
- WebAudio (decodeAudioData)
- MediaRecorder
- WebRTC

But there’s no general way to flexibly configure and use these media codecs. 
Because of this, many web applications have resorted to implementing 
media codecs in JavaScript or WebAssembly, despite the disadvantages:
- Increased bandwidth to download codecs already in the browser.
- Reduced performance
- Reduced power efficiency 

It's great for:
- Live streaming
- Cloud gaming
- Media file editing and transcoding

See the [explainer](https://github.com/w3c/webcodecs/blob/main/explainer.md) for more info.


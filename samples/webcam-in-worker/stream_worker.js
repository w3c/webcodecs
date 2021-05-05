var frameCount = 0
var stopped = false;
self.addEventListener('message', function(e) {

  // In this demo, we expect at most two messages, one of each type.
  var type = e.data.type;

  if (type == "stop") {
    stopped = true;
    return;
  }

  if (type != "stream") {
    console.log("Invalid message received.");
    return;
  }

  const frameStream = e.data.stream;
  const frameReader = frameStream.getReader();

  console.log("Received stream from main page.");

  frameReader.read().then(function processFrame({done, value}) {
    if (done) {
      self.postMessage("Stream is done");
      return;
    }

    var frame = value;

    // NOTE: all paths below must call frame.close(). Otherwise, the GC won't
    // be fast enoug to recollect VideoFrames, and decoding can stall.

    if (stopped) {
      // TODO: There might be a more elegant way of closing a stream, or other
      // events to listen for.
      frameReader.releaseLock();
      frameStream.cancel();

      frame.close();
      self.postMessage("Stream stopped");
      return
    }

    // Processing on 'frame' goes here!
    // E.g. this is where encoding via a VideoEncoder could be set up, or
    // rendering to an OffscreenCanvas.

    // For now, simply confirm we are receiving frames.
    if (++frameCount % 20 == 0) {
      self.postMessage("Read 20 frames");
    }

    frame.close();
    frameReader.read().then(processFrame);
  })
}, false);

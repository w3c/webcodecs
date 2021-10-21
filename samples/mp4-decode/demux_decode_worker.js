importScripts('./mp4box.all.min.js');
importScripts('./mp4_demuxer.js');

let demuxer = new MP4Demuxer("/webcodecs/samples/media/bbb.mp4");

let decoder = new VideoDecoder({
    output: f => {
      self.postMessage({ type:"frame", frame: f });
      f.close();
    },
    error: e => console.error(e),
});

demuxer.getConfig().then((config) => {
  self.postMessage({ type:"config", config: config });

  decoder.configure(config);
  demuxer.start((chunk) => {
    decoder.decode(chunk);
  })
});

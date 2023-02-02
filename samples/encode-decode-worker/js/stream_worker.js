'use strict';

let encoder, decoder, pl, started = false, stopped = false;

let encqueue_aggregate = {
  all: [],
  min: Number.MAX_VALUE,
  max: 0,
  avg: 0,
  sum: 0,
};

let decqueue_aggregate = {
  all: [],
  min: Number.MAX_VALUE,
  max: 0,
  avg: 0,
  sum: 0,
};

function encqueue_update(duration) {
  encqueue_aggregate.all.push(duration);
  encqueue_aggregate.min = Math.min(encqueue_aggregate.min, duration);
  encqueue_aggregate.max = Math.max(encqueue_aggregate.max, duration);
  encqueue_aggregate.sum += duration;
}

function encqueue_report() {
  encqueue_aggregate.all.sort();
  const len = encqueue_aggregate.all.length;
  const half = len >> 1;
  const f = (len + 1) >> 2;
  const t = (3 * (len + 1)) >> 2;
  const alpha1 = (len + 1)/4 - Math.trunc((len + 1)/4);
  const alpha3 = (3 * (len + 1)/4) - Math.trunc(3 * (len + 1)/4);
  const fquart = encqueue_aggregate.all[f] + alpha1 * (encqueue_aggregate.all[f + 1] - encqueue_aggregate.all[f]);
  const tquart = encqueue_aggregate.all[t] + alpha3 * (encqueue_aggregate.all[t + 1] - encqueue_aggregate.all[t]);
  const median = len % 2 === 1 ? encqueue_aggregate.all[len >> 1] : (encqueue_aggregate.all[half - 1] + encqueue_aggregate.all[half]) / 2;
  return {
     count: len,
     min: encqueue_aggregate.min,
     fquart: fquart,
     avg: encqueue_aggregate.sum / len,
     median: median,
     tquart: tquart,
     max: encqueue_aggregate.max,
  };
}

function decqueue_update(duration) {
   decqueue_aggregate.all.push(duration);
   decqueue_aggregate.min = Math.min(decqueue_aggregate.min, duration);
   decqueue_aggregate.max = Math.max(decqueue_aggregate.max, duration);
   decqueue_aggregate.sum += duration;
}

function decqueue_report() {
  decqueue_aggregate.all.sort();
  const len = decqueue_aggregate.all.length;
  const half = len >> 1;
  const f = (len + 1) >> 2;
  const t = (3 * (len + 1)) >> 2;
  const alpha1 = (len + 1)/4 - Math.trunc((len + 1)/4);
  const alpha3 = (3 * (len + 1)/4) - Math.trunc(3 * (len + 1)/4);
  const fquart = decqueue_aggregate.all[f] + alpha1 * (decqueue_aggregate.all[f + 1] - decqueue_aggregate.all[f]);
  const tquart = decqueue_aggregate.all[t] + alpha3 * (decqueue_aggregate.all[t + 1] - decqueue_aggregate.all[t]);
  const median = len % 2 === 1 ? decqueue_aggregate.all[len >> 1] : (decqueue_aggregate.all[half - 1] + decqueue_aggregate.all[half]) / 2;
  return {
     count: len,
     min: decqueue_aggregate.min,
     fquart: fquart,
     avg: decqueue_aggregate.sum / len,
     median: median,
     tquart: tquart,
     max: decqueue_aggregate.max,
  };
}

self.addEventListener('message', async function(e) {
  if (stopped) return;
  // In this demo, we expect at most two messages, one of each type.
  let type = e.data.type;

  if (type == "stop") {
    self.postMessage({text: 'Stop message received.'});
    if (started) pl.stop();
    return;
  } else if (type != "stream"){
    self.postMessage({severity: 'fatal', text: 'Invalid message received.'});
    return;
  }
  // We received a "stream" event
  self.postMessage({text: 'Stream event received.'});

  try {
    pl = new pipeline(e.data);
    pl.start();
  } catch (e) {
    self.postMessage({severity: 'fatal', text: `Pipeline creation failed: ${e.message}`})
    return;
  }
}, false);

class pipeline {

   constructor(eventData) {
     this.stopped = false;
     this.inputStream = eventData.streams.input;
     this.outputStream = eventData.streams.output;
     this.config = eventData.config;
   }

   DecodeVideoStream(self) {
     return new TransformStream({
       start(controller) {
         this.decoder = decoder = new VideoDecoder({
           output: frame => controller.enqueue(frame),
           error: (e) => {
              self.postMessage({severity: 'fatal', text: `Init Decoder error: ${e.message}`});
           }
         });
       },
       transform(chunk, controller) {
         if (this.decoder.state != "closed") {
           if (chunk.type == "config") {
              let config = JSON.parse(chunk.config);
              VideoDecoder.isConfigSupported(config).then((decoderSupport) => {
                if(decoderSupport.supported) {
                  this.decoder.configure(decoderSupport.config);
                  self.postMessage({text: 'Decoder successfully configured:\n' + JSON.stringify(decoderSupport.config)});
                } else {
                self.postMessage({severity: 'fatal', text: 'Config not supported:\n' + JSON.stringify(decoderSupport.config)});
                }
              })
              .catch((e) => {
                 self.postMessage({severity: 'fatal', text: `Configuration error: ${e.message}`});
              })
           } else {
             try {
               const queue = this.decoder.decodeQueueSize;
               decqueue_update(queue);
               this.decoder.decode(chunk);
             } catch (e) {
               self.postMessage({severity: 'fatal', text: 'Derror size: ' + chunk.byteLength + ' seq: ' + chunk.seqNo + ' kf: ' + chunk.keyframeIndex + ' delta: ' + chunk.deltaframeIndex + ' dur: ' + chunk.duration + ' ts: ' + chunk.timestamp + ' ssrc: ' + chunk.ssrc + ' pt: ' + chunk.pt + ' tid: ' + chunk.temporalLayerId + ' type: ' + chunk.type});
               self.postMessage({severity: 'fatal', text: `Catch Decode error: ${e.message}`});
             }
           }
         }
       }
     });
   }

   EncodeVideoStream(self, config) {
     return new TransformStream({
       start(controller) {
         this.frameCounter = 0;
         this.seqNo = 0;
         this.keyframeIndex = 0;
         this.deltaframeIndex = 0;
         this.pending_outputs = 0;
         this.encoder = encoder = new VideoEncoder({
           output: (chunk, cfg) => {
             if (cfg.decoderConfig) {
               const decoderConfig = JSON.stringify(cfg.decoderConfig);
               self.postMessage({text: 'Configuration: ' + decoderConfig});
               const configChunk =
               {
                  type: "config",
                  seqNo: this.seqNo,
                  keyframeIndex: this.keyframeIndex,
                  deltaframeIndex: this.deltaframeIndex,
                  timestamp: 0,
                  pt: 0,
                  config: decoderConfig 
               };
               controller.enqueue(configChunk); 
             } 
             chunk.temporalLayerId = 0;
             if (cfg.svc) {
               chunk.temporalLayerId = cfg.svc.temporalLayerId;
             }
             this.seqNo++;
             if (chunk.type == 'key') {
               this.keyframeIndex++;
               this.deltaframeIndex = 0;
             } else {
               this.deltaframeIndex++;
             } 
             this.pending_outputs--;
             chunk.seqNo = this.seqNo;
             chunk.keyframeIndex = this.keyframeIndex;
             chunk.deltaframeIndex = this.deltaframeIndex;
             controller.enqueue(chunk);
           },
           error: (e) => {
             self.postMessage({severity: 'fatal', text: `Encoder error: ${e.message}`});
           }
         });
         VideoEncoder.isConfigSupported(config).then((encoderSupport) => {
           if(encoderSupport.supported) {
             this.encoder.configure(encoderSupport.config);
             self.postMessage({text: 'Encoder successfully configured:\n' + JSON.stringify(encoderSupport.config)});
           } else {
             self.postMessage({severity: 'fatal', text: 'Config not supported:\n' + JSON.stringify(encoderSupport.config)});
           }
         })
         .catch((e) => {
            self.postMessage({severity: 'fatal', text: `Configuration error: ${e.message}`});
         })
       },
       transform(frame, controller) {
         if (this.pending_outputs <= 30) {
           this.pending_outputs++;
           const insert_keyframe = (this.frameCounter % config.keyInterval) == 0;
           this.frameCounter++;
           try {
             if (this.encoder.state != "closed") {
               const queue = this.encoder.encodeQueueSize;
               encqueue_update(queue);
               this.encoder.encode(frame, { keyFrame: insert_keyframe });
             } 
           } catch(e) {
             self.postMessage({severity: 'fatal', text: 'Encoder Error: ' + e.message});
           }
         }
         frame.close();
       }
     });
   }

   stop() {
     const encqueue_stats = encqueue_report();
     const decqueue_stats = decqueue_report();
     self.postMessage({text: 'Encoder Queue report: ' + JSON.stringify(encqueue_stats)});
     self.postMessage({text: 'Decoder Queue report: ' + JSON.stringify(decqueue_stats)});
     if (stopped) return;
     stopped = true;
     this.stopped = true;
     self.postMessage({text: 'stop() called'});
     if (encoder.state != "closed") encoder.close();
     if (decoder.state != "closed") decoder.close();
     self.postMessage({text: 'stop(): frame, encoder and decoder closed'});
     return;
   }

   async start() {
     if (stopped) return;
     started = true;
     let duplexStream, readStream, writeStream;
     self.postMessage({text: 'Start method called.'});
     try { 
       await this.inputStream
           .pipeThrough(this.EncodeVideoStream(self,this.config))
           .pipeThrough(this.DecodeVideoStream(self))
           .pipeTo(this.outputStream);
     } catch (e) {
       self.postMessage({severity: 'fatal', text: `start error: ${e.message}`});
     }
   }
}

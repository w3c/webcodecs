// The "download worker" is where the download fetch and buffering occurs. This
// worker is connected to the "blocking demuxer worker" which will send us
// "read" requests to fulfill.

self.debugLog = function(msg) {
  console.debug('[download worker]' + msg);
}

debugLog(` -- worker started`);

import {DownloadReader} from './download_reader.js';

let downloadReader = null;

self.addEventListener('message', async function(e) {
  // debugLog(`Download worker message: ${JSON.stringify(e.data)}`);

  switch (e.data.command) {
    case 'initialize':
      downloadReader = new DownloadReader();
      await downloadReader.initialize(e.data.file, e.data.sab);
      postMessage({command: 'initialize-done'});
      break;
    case 'read':
      downloadReader.read(e.data.numBytes);
      break;
    default:
      console.error(`Download worker bad message: ${e.data}`);
  }

});
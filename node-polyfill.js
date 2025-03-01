// This file provides polyfills for globals that might be missing in older Node.js versions
import { Readable } from 'stream';

// Polyfill for ReadableStream
if (typeof ReadableStream === 'undefined') {
  global.ReadableStream = class ReadableStreamPolyfill extends Readable {
    constructor(options) {
      super(options);
    }
  };
}

// Ensure other required Web API globals are available
if (typeof Response === 'undefined') {
  global.Response = class ResponsePolyfill {};
}

if (typeof Request === 'undefined') {
  global.Request = class RequestPolyfill {};
}

if (typeof Headers === 'undefined') {
  global.Headers = class HeadersPolyfill {};
}

// Export to make sure this file is not tree-shaken
export default 'polyfill';
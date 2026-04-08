// Stub for Metro bundling — @ffmpeg packages are loaded at runtime via dynamic import()
// in videoExchangeCompressor.js. Metro cannot parse their worker.js syntax, so we
// redirect static resolution here. The real modules load fine at runtime from node_modules.
export default {};

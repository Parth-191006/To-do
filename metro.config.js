// Metro configuration.
//
// The only reason this file exists: `expo-sqlite` ships a WebAssembly build for
// the web platform, and Metro has to be told that `.wasm` is an asset it should
// copy through instead of trying to parse as JavaScript.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

module.exports = config;

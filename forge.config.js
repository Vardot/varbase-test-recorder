const { VitePlugin } = require('@electron-forge/plugin-vite');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Varbase Test Recorder',
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['win32', 'darwin', 'linux'] },
    { name: '@electron-forge/maker-squirrel', config: {} },
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/index.js', config: 'vite.main.config.mjs' },
        { entry: 'src/preload/preload.js', config: 'vite.preload.config.mjs' },
        { entry: 'src/preload/recorder-preload.js', config: 'vite.preload.config.mjs' },
      ],
      renderer: [
        { name: 'main_window', config: 'vite.renderer.config.mjs' },
      ],
    }),
  ],
};

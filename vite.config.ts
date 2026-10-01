import { defineConfig } from 'vite'

// Relative base so the built folder works from any address: GitHub Pages,
// a Tupai subpath, or inside an iframe.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [
    {
      // A watcher error is logged instead of stopping the dev server.
      name: 'keep-watching',
      configureServer(server) {
        server.watcher.on('error', (error) => server.config.logger.warn(`File watcher: ${String(error)}`))
      },
    },
  ],
  server: {
    watch: {
      // On Windows the file watcher crashed the dev server ("EBUSY") when a
      // new file was still being written. Waiting for writes to finish, and
      // not watching the big source folders, avoids that.
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
      ignored: ['**/art-src/**', '**/audio-src/**', '**/questions/**', '**/dist/**'],
    },
  },
})

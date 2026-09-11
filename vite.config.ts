import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  /**
   * Relative base so the built bundle also loads from a `file://` origin.
   * An Android WebView serves the bundle from local storage rather than a web
   * root, so absolute `/assets/...` URLs would 404 there. Keeping this
   * relative now avoids reworking the build when native packaging is added.
   */
  base: './',

  resolve: {
    // Mirrors `paths` in tsconfig.json; change both together.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    host: true, // expose on the LAN so a physical handset can load the dev server
    port: 5173,
  },

  preview: {
    host: true,
    port: 4173,
  },

  build: {
    target: 'es2022',
    /**
     * No sourcemaps in the shipped build. They were 10.8 MB — 38% of `dist/` — and
     * `cap sync` copies them verbatim into the APK, so every install carried readable
     * engine and game source. If stack traces are wanted later, `'hidden'` plus an
     * upload step keeps them out of the bundle; `npm run dev` is unaffected either way.
     */
    sourcemap: false,
    // Phaser is a large single dependency; the default 500 kB warning is noise here.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        /**
         * Split the engine into its own chunk. Phaser changes only on upgrade,
         * so it stays cached across game-code deploys — worth doing for the
         * mobile connections the target audience is on.
         *
         * Vite 8 bundles with Rolldown, whose current chunking API is
         * `output.codeSplitting.groups`. The Rollup-style `manualChunks`
         * object form is not supported here.
         */
        codeSplitting: {
          groups: [{ name: 'phaser', test: /[\\/]node_modules[\\/]phaser[\\/]/ }],
        },
      },
    },
  },
});

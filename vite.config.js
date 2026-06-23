import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    target: 'es2019',
    sourcemap: false,
    assetsInlineLimit: 4096
  }
});

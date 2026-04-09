import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/face-mosaic-app/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // onnxruntime-web の WASM ファイルをバンドルから除外
        // 実行時は CDN (jsdelivr) から読み込むため不要
        manualChunks: undefined,
      },
    },
  },
  assetsInclude: [],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
})

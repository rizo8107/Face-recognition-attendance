import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.PB_URL': JSON.stringify(env.PB_URL),
        'process.env.PB_ADMIN_EMAIL': JSON.stringify(env.PB_ADMIN_EMAIL),
        'process.env.PB_ADMIN_PASSWORD': JSON.stringify(env.PB_ADMIN_PASSWORD)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        include: [
          '@vladmandic/face-api',
          '@tensorflow/tfjs',
          '@tensorflow/tfjs-backend-webgl'
        ],
      }
    };
});

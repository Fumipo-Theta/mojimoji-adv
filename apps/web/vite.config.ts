import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const certDir = resolve(here, '../server/certs');
const keyPath = resolve(certDir, 'key.pem');
const certPath = resolve(certDir, 'cert.pem');

/**
 * 証明書があれば dev サーバーも HTTPS で立てる。
 * スマホをスキャナ端末にする場合、HTTP だとカメラがブラウザにブロックされるため。
 */
const https =
  existsSync(keyPath) && existsSync(certPath)
    ? { key: readFileSync(keyPath), cert: readFileSync(certPath) }
    : undefined;

const API_TARGET = process.env.API_TARGET ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    // LAN の別端末（スマホ）から開けるようにする
    host: '0.0.0.0',
    port: 5173,
    https,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/ws': { target: API_TARGET.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

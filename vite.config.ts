/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  // Режим standalone: всё приложение собирается в один HTML-файл, который открывается
  // двойным щелчком на любом компьютере — без установки Node.js и без сервера.
  const standalone = mode === 'standalone';
  return {
    // Относительные пути: собранное приложение можно открыть из любой папки.
    base: './',
    plugins: standalone ? [react(), viteSingleFile()] : [react()],
    build: standalone ? { outDir: 'release' } : {},
    server: { port: 5173, strictPort: true },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});

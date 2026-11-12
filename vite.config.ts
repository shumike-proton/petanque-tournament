/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  // standalone — один HTML-файл, который открывается двойным щелчком на любом компьютере.
  // pages — сайт для GitHub Pages: тот же единый файл плюс манифест, иконки и сервис-воркер,
  //         чтобы приложение ставилось на главный экран телефона и работало без интернета.
  const singleFile = mode === 'standalone' || mode === 'pages';
  const outDir = mode === 'standalone' ? 'release' : mode === 'pages' ? 'pages-dist' : 'dist';
  return {
    // Относительные пути: приложение работает из любой папки и по любому адресу сайта.
    base: './',
    // Файлы для сайта (манифест, иконки, сервис-воркер) не нужны рядом с автономным файлом.
    publicDir: mode === 'standalone' ? false : 'public',
    plugins: singleFile ? [react(), viteSingleFile()] : [react()],
    build: { outDir },
    server: { port: 5173, strictPort: true },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});

import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  resolve: {
    // Allow '@/foo' imports from anywhere in src/
    alias: { '@': '/src' },
  },
  server: {
    // Bind to all interfaces so it works inside containers / remote dev too
    host: true,
  },
});

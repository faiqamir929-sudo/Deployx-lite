import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..');

export default defineConfig(({ mode }) => {
  // Defaults allow running locally with plain `pnpm dev`; hosted environments
  // override these via environment variables. Vite config files run before
  // import.meta.env is available, so load the repository .env explicitly.
  const env = loadEnv(mode, workspaceRoot, '');
  // PORT is the hosted/Replit convention; WEB_PORT keeps the shared local
  // .env from making the API and Vite server compete for port 8080.
  const rawPort =
    process.env.PORT ??
    process.env.WEB_PORT ??
    env.WEB_PORT ??
    env.PORT ??
    '5173';
  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const basePath = process.env.BASE_PATH ?? env.BASE_PATH ?? '/';

  // Where the API server runs; used to forward /api and /docs in local dev.
  const apiTarget =
    process.env.API_PROXY_TARGET ??
    env.API_PROXY_TARGET ??
    'http://localhost:8080';

  return {
    base: basePath,
    // The repository-level .env is shared by the API and frontend. Without
    // envDir, Vite only checks artifacts/deployx-lite/.env.
    envDir: workspaceRoot,
    plugins: [react(), tailwindcss({ optimize: false })],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '@assets': path.resolve(
          import.meta.dirname,
          '..',
          '..',
          'attached_assets',
        ),
      },
      dedupe: ['react', 'react-dom'],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, 'dist/public'),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: {
        // Keep the browser's Host/Origin pair intact so the API's
        // same-origin CORS guard accepts credentialed local requests.
        '/api': { target: apiTarget, changeOrigin: false },
        '/docs': { target: apiTarget, changeOrigin: false },
      },
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});

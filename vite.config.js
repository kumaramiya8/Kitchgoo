import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import helpHandler from './api/help.js';

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;

  return {
    plugins: [
      react(),
      {
        name: 'api-server-dev',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            if (url.pathname === '/api/help') {
              try {
                // Mock Vercel response helper methods
                res.status = (code) => {
                  res.statusCode = code;
                  return res;
                };
                res.json = (data) => {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                  return res;
                };

                await helpHandler(req, res);
              } catch (err) {
                console.error('[DEV API] Error handling /api/help:', err);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
              }
            } else {
              next();
            }
          });
        }
      }
    ],
    base: '/',
  };
});

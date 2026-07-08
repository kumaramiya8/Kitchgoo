import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Expose server-side env to the API apps mounted in dev. In production
  // these come from Vercel's environment settings instead.
  const SERVER_ENV_KEYS = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'ZEENIE_API_KEY',
    'ZEENIE_MODEL',
  ];
  for (const key of SERVER_ENV_KEYS) {
    if (env[key] !== undefined) process.env[key] = env[key];
  }

  return {
    plugins: [
      react(),
      {
        // Mount the real backend (api/) into the Vite dev server so
        // `npm run dev` serves the full stack — no vercel CLI needed.
        name: 'api-server-dev',
        async configureServer(server) {
          // Dynamic imports so the env assignments above run before the
          // API modules read process.env at init.
          const { default: authApp } = await import('./api/auth.js');
          const { default: dataApp } = await import('./api/data.js');
          const { default: publicApp } = await import('./api/public.js');
          const { default: helpHandler } = await import('./api/help.js');

          // Express apps act as connect middleware: they handle their own
          // routes and fall through to the next handler for everything else.
          server.middlewares.use(authApp);
          server.middlewares.use(dataApp);
          server.middlewares.use(publicApp);

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

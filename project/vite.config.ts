import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Built-in Node.js CORS Proxy Plugin for Vite Dev Server
 * Handles outbound requests to GDELT and RSS syndication feeds without browser CORS blocks.
 */
function newsProxyPlugin(): Plugin {
  return {
    name: 'news-proxy-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/proxy')) {
          try {
            const parsedUrl = new URL(req.url, 'http://localhost');
            const target = parsedUrl.searchParams.get('url');
            if (!target) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing "url" query parameter' }));
              return;
            }

            const response = await fetch(target, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NewsPulse/1.0',
                'Accept': '*/*',
              },
            });

            res.statusCode = response.status;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Expose-Headers', 'Retry-After, Content-Type, Content-Length');
            
            const retryAfter = response.headers.get('retry-after');
            if (retryAfter) {
              res.setHeader('Retry-After', retryAfter);
            }

            const contentType = response.headers.get('content-type');
            if (contentType) {
              res.setHeader('Content-Type', contentType);
            }

            const buffer = await response.arrayBuffer();
            res.end(Buffer.from(buffer));
            return;
          } catch (err: unknown) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
            return;
          }
        }
        next();
      });
    },
  };
}

// Real-Time News Analytics Vite Config
export default defineConfig({
  plugins: [react(), newsProxyPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});

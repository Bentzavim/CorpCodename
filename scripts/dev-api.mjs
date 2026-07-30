/**
 * Runs the /api handlers locally.
 *
 * Vercel gives each file in api/ its own function; there is no equivalent when
 * running `vite dev`, so this mounts the very same handlers on a plain Node
 * server and Vite proxies /api to it. Same code both sides — the handlers take
 * Node's own req/res rather than anything Vercel-shaped, which is what makes
 * that possible.
 *
 *     node scripts/dev-api.mjs [port]
 */
import { createServer } from 'node:http';
import { createServer as createVite } from 'vite';

const port = Number(process.argv[2] ?? 3001);

// Vite's SSR pipeline compiles the TypeScript handlers on demand.
const vite = await createVite({ server: { middlewareMode: true }, appType: 'custom' });

const ROUTES = {
  '/api/room': 'api/room.ts',
  '/api/stream': 'api/stream.ts',
};

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const entry = ROUTES[path];
  if (!entry) {
    res.statusCode = 404;
    return res.end('not found');
  }
  try {
    const module = await vite.ssrLoadModule(`/${entry}`);
    await module.default(req, res);
  } catch (err) {
    vite.ssrFixStacktrace(err);
    console.error(err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify({ error: String(err?.message ?? err) }));
  }
});

server.listen(port, () => {
  console.log(`dev api on http://localhost:${port}`);
});

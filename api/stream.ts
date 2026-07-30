import type { IncomingMessage, ServerResponse } from 'node:http';
import { getStore } from '../server/store.js';
import { publicRoom } from '../src/room/view.js';
import type { Room } from '../src/room/types.js';

/**
 * One Server-Sent Events stream per player.
 *
 * SSE rather than a WebSocket because the traffic is one-directional and rare:
 * players POST their actions and the server pushes the resulting state. There is
 * no protocol upgrade involved, so it runs on an ordinary serverless function,
 * and `EventSource` reconnects by itself when the platform cuts a long request.
 */
/**
 * The stream closes itself well inside any plausible platform cap, so the end is
 * ours and the client's own reconnect runs. No `maxDuration` is declared: the
 * allowed ceiling depends on the plan, and an unsupported value fails the whole
 * invocation rather than degrading. If the platform cuts the stream first,
 * EventSource reconnects and nothing is lost — the client resumes from its
 * last version.
 */
const LIFETIME_MS = 25_000;
const HEARTBEAT_MS = 15_000;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '', 'http://localhost');
  const code = (url.searchParams.get('code') ?? '').toUpperCase();
  const playerId = url.searchParams.get('playerId') ?? '';
  const since = Number(url.searchParams.get('since') ?? '0');

  if (!code || !playerId) {
    res.statusCode = 400;
    return res.end('code and playerId are required');
  }

  const store = getStore();
  const existing = await store.get(code);
  if (!existing) {
    res.statusCode = 404;
    return res.end('no such room');
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Tells any proxy in front of us not to buffer, which would defeat the point.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  const push = (room: Room) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(publicRoom(room, playerId))}\n\n`);
  };

  // Send current state immediately unless the client already has this version —
  // on reconnect that avoids a redundant repaint.
  if (existing.version !== since) push(existing);

  const unwatch = store.watch(code, push);
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  // Close before the platform does, so the client sees a clean end and its own
  // reconnect logic runs rather than an error.
  const lifetime = setTimeout(() => {
    if (!closed) res.write('event: cycle\ndata: {}\n\n');
    finish();
  }, LIFETIME_MS);

  function finish() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(lifetime);
    unwatch();
    res.end();
  }

  req.on('close', finish);
  req.on('error', finish);
}

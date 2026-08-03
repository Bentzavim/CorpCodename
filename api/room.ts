import type { IncomingMessage, ServerResponse } from 'node:http';
import { RoomError, apply, cleanName } from '../src/room/actions.js';
import {
  RoomNotFound,
  blankRoom,
  getStore,
  newPlayerId,
  newRoomCode,
  storeKind,
  storeDiagnosis,
} from '../server/store.js';
import { publicRoom } from '../src/room/view.js';
import type { RoomAction } from '../src/room/types.js';

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse;

function send(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function parse(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new RoomError('Malformed request.');
  }
}

/**
 * Reads the request body in whichever shape the platform hands it over.
 *
 * Vercel parses the body itself and sets `req.body` — as an object, but also as
 * a string or a Buffer depending on how the request arrived. Reading the stream
 * in those cases waits on bytes that have already been consumed and never
 * arrive, so the function hangs until the platform kills it and the caller sees
 * a gateway error rather than an answer. Locally `req.body` is unset and the
 * stream is the only source, so both paths have to work.
 */
async function readBody(req: Req): Promise<Record<string, unknown>> {
  const given = req.body;
  if (given !== undefined && given !== null) {
    if (Buffer.isBuffer(given)) return parse(given.toString('utf8'));
    if (typeof given === 'string') return parse(given);
    if (typeof given === 'object') return given as Record<string, unknown>;
  }

  // Nothing pre-parsed: read the stream, but never wait on it indefinitely.
  const raw = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => reject(new RoomError('Timed out reading the request.')), 5000);
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return parse(raw);
}

export default async function handler(req: Req, res: Res) {
  // Openable in a browser, so "is the API even deployed?" can be answered
  // without a console. Reports only which store is wired up — no room data.
  if (req.method === 'GET') {
    return send(res, 200, {
      ok: true,
      ...storeDiagnosis(),
      node: process.version,
      time: new Date().toISOString(),
    });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'POST or GET only.' });

  try {
    const body = await readBody(req);
    const op = String(body.op ?? '');
    const store = getStore();
    const now = Date.now();

    if (op === 'health') {
      return send(res, 200, { store: storeKind() });
    }

    if (op === 'create') {
      const playerId = newPlayerId();
      const code = newRoomCode();
      // The room is born in the mode the host chose, rather than dealt as a duel
      // and switched a moment later: switching clears every seat, so a room that
      // arrived as one thing and became another would unseat whoever was quick.
      const wanted = body.mode === 'relay' ? 'relay' : 'duel';
      const room = blankRoom(code, playerId, String(body.name ?? ''), now, wanted);
      await store.create(room);
      return send(res, 200, { playerId, room: publicRoom(room, playerId, now) });
    }

    const code = String(body.code ?? '').toUpperCase();
    if (!code) throw new RoomError('No room code given.');

    if (op === 'join') {
      // A returning player keeps their seat; a new one takes an empty chair.
      const wanted = typeof body.playerId === 'string' ? body.playerId : null;
      const playerId = wanted ?? newPlayerId();
      const room = await store.mutate(code, (current) => {
        const existing = current.players.find((p) => p.id === playerId);
        if (existing) {
          return {
            ...current,
            version: current.version + 1,
            updatedAt: now,
            players: current.players.map((p) =>
              p.id === playerId ? { ...p, lastSeen: now } : p,
            ),
          };
        }
        if (current.players.length >= 20) throw new RoomError('That room is full.');
        return {
          ...current,
          version: current.version + 1,
          updatedAt: now,
          players: [
            ...current.players,
            { id: playerId, name: cleanName(String(body.name ?? '')), team: null, seat: null, lastSeen: now },
          ],
        };
      });
      return send(res, 200, { playerId, room: publicRoom(room, playerId, now) });
    }

    const playerId = String(body.playerId ?? '');
    if (!playerId) throw new RoomError('No player id given.');

    if (op === 'ping') {
      const room = await store.mutate(code, (current) => ({
        ...current,
        updatedAt: now,
        // Deliberately does not bump `version`: a heartbeat must not wake every
        // other player's stream, or eight players would push each other awake.
        players: current.players.map((p) => (p.id === playerId ? { ...p, lastSeen: now } : p)),
      }));
      return send(res, 200, { room: publicRoom(room, playerId, now) });
    }

    if (op === 'action') {
      const action = body.action as RoomAction;
      if (!action || typeof action.type !== 'string') throw new RoomError('No action given.');
      const room = await store.mutate(code, (current) =>
        apply(
          { ...current, players: current.players.map((p) => (p.id === playerId ? { ...p, lastSeen: now } : p)) },
          playerId,
          action,
          now,
        ),
      );
      return send(res, 200, { room: publicRoom(room, playerId, now) });
    }

    throw new RoomError(`Unknown request "${op}".`);
  } catch (err) {
    if (err instanceof RoomNotFound) return send(res, 404, { error: err.message });
    if (err instanceof RoomError) return send(res, 400, { error: err.message });
    // Anything unexpected is ours, and its detail is not the player's business.
    console.error('room handler failed', err);
    return send(res, 500, { error: 'Something went wrong on our side.' });
  }
}

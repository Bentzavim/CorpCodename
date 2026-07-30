import type { IncomingMessage, ServerResponse } from 'node:http';
import { RoomError, apply, cleanName } from '../src/room/actions';
import {
  RoomNotFound,
  blankRoom,
  getStore,
  newPlayerId,
  newRoomCode,
  storeKind,
} from '../server/store';
import { publicRoom } from '../src/room/view';
import type { RoomAction } from '../src/room/types';

export const config = { maxDuration: 15 };

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse;

function send(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: Req): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new RoomError('Malformed request.');
  }
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only.' });

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
      const room = blankRoom(code, playerId, String(body.name ?? ''), now);
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

import { randomSeed } from '../src/game/rng.js';
import { ROOM_CODE_LENGTH, ROOM_TTL_MS, type PlayerId, type Room } from '../src/room/types.js';
import { cleanName } from '../src/room/actions.js';

/**
 * Where rooms live between requests.
 *
 * A serverless function forgets everything the moment it returns, so this is
 * the one piece of the feature that genuinely needs somewhere to put state.
 * Two implementations: memory for local development and for a single instance,
 * Redis for anything that scales past one.
 */
export interface RoomStore {
  get(code: string): Promise<Room | null>;
  /**
   * Read, change, write, all as one step. Rooms are edited from several requests
   * at once, so callers must not read and write separately.
   */
  mutate(code: string, change: (room: Room) => Room): Promise<Room>;
  create(room: Room): Promise<void>;
  /** Fires whenever any instance changes this room, so streams can push. */
  watch(code: string, onChange: (room: Room) => void): () => void;
}

export function newRoomCode(): string {
  return randomSeed(ROOM_CODE_LENGTH);
}

export function newPlayerId(): PlayerId {
  return `p_${randomSeed(16).toLowerCase()}`;
}

export function blankRoom(code: string, hostId: PlayerId, hostName: string, now = Date.now()): Room {
  return {
    code,
    seed: randomSeed(10),
    hostId,
    players: [{ id: hostId, name: cleanName(hostName), team: null, seat: null, lastSeen: now }],
    game: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export class RoomNotFound extends Error {
  constructor() {
    super('That room code does not exist. It may have expired.');
  }
}

// ---------------------------------------------------------------------------
// In-memory
// ---------------------------------------------------------------------------

type Listener = (room: Room) => void;

export function createMemoryStore(): RoomStore {
  const rooms = new Map<string, Room>();
  const listeners = new Map<string, Set<Listener>>();

  const sweep = () => {
    const cutoff = Date.now() - ROOM_TTL_MS;
    for (const [code, room] of rooms) if (room.updatedAt < cutoff) rooms.delete(code);
  };

  return {
    async get(code) {
      sweep();
      return rooms.get(code) ?? null;
    },
    async create(room) {
      rooms.set(room.code, room);
    },
    async mutate(code, change) {
      const current = rooms.get(code);
      if (!current) throw new RoomNotFound();
      const next = change(current);
      rooms.set(code, next);
      for (const fn of listeners.get(code) ?? []) fn(next);
      return next;
    },
    watch(code, onChange) {
      const set = listeners.get(code) ?? new Set<Listener>();
      set.add(onChange);
      listeners.set(code, set);
      return () => {
        set.delete(onChange);
        if (set.size === 0) listeners.delete(code);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Redis (Upstash REST — no TCP socket, which suits a serverless function)
// ---------------------------------------------------------------------------

interface RedisConfig {
  url: string;
  token: string;
}

export function redisConfigFromEnv(env: Record<string, string | undefined>): RedisConfig | null {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function createRedisStore(config: RedisConfig, poll = 700): RoomStore {
  const key = (code: string) => `room:${code}`;

  async function command(...args: (string | number)[]): Promise<unknown> {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args.map(String)),
    });
    if (!res.ok) throw new Error(`Redis ${res.status}: ${await res.text()}`);
    const payload = (await res.json()) as { result?: unknown };
    return payload.result;
  }

  async function read(code: string): Promise<Room | null> {
    const raw = (await command('GET', key(code))) as string | null;
    return raw ? (JSON.parse(raw) as Room) : null;
  }

  async function write(room: Room): Promise<void> {
    await command('SET', key(room.code), JSON.stringify(room), 'PX', ROOM_TTL_MS);
  }

  return {
    get: read,
    async create(room) {
      await write(room);
    },
    async mutate(code, change) {
      // Optimistic: re-read and retry if another request changed the room first.
      // Contention is a turn-based game's worth — a handful of actions a minute.
      for (let attempt = 0; attempt < 5; attempt++) {
        const current = await read(code);
        if (!current) throw new RoomNotFound();
        const next = change(current);
        const swapped = (await command(
          'EVAL',
          "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3]); return 1 else return 0 end",
          1,
          key(code),
          JSON.stringify(current),
          JSON.stringify(next),
          ROOM_TTL_MS,
        )) as number;
        if (swapped === 1) return next;
      }
      throw new Error('The room was being changed too quickly. Try again.');
    },
    /**
     * Upstash's REST API has no persistent subscription, so a stream polls its
     * own room. Only the SSE handler does this, one poll per connected player,
     * and it pushes the moment the version moves.
     */
    watch(code, onChange) {
      let stopped = false;
      let lastVersion = -1;
      const tick = async () => {
        while (!stopped) {
          try {
            const room = await read(code);
            if (room && room.version !== lastVersion) {
              lastVersion = room.version;
              onChange(room);
            }
          } catch {
            // A blip should not kill the stream; the next tick tries again.
          }
          await new Promise((r) => setTimeout(r, poll));
        }
      };
      void tick();
      return () => {
        stopped = true;
      };
    },
  };
}

let shared: RoomStore | null = null;

/** One store per process, chosen from the environment. */
export function getStore(env: Record<string, string | undefined> = process.env): RoomStore {
  if (shared) return shared;
  const redis = redisConfigFromEnv(env);
  shared = redis ? createRedisStore(redis) : createMemoryStore();
  return shared;
}

export function storeKind(env: Record<string, string | undefined> = process.env): 'redis' | 'memory' {
  return redisConfigFromEnv(env) ? 'redis' : 'memory';
}

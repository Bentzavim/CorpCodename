/**
 * Speaks the Upstash REST protocol in front of a plain local Redis, so the
 * production store path can be exercised for real rather than assumed.
 *
 *     redis-server --port 6399 --daemonize yes --save ''
 *     node scripts/redis-rest-shim.mjs
 *     KV_REST_API_URL=http://localhost:8799 KV_REST_API_TOKEN=test-token npm run dev:api
 *
 * Raw RESP, no dependencies. Development only — the token is a constant and
 * there is no TLS.
 */
import { createServer } from 'node:http';
import { connect } from 'node:net';

const REDIS_PORT = 6399;
const PORT = 8799;
const TOKEN = 'test-token';

function encode(args) {
  return `*${args.length}\r\n` + args.map((a) => `$${Buffer.byteLength(String(a))}\r\n${a}\r\n`).join('');
}

// Minimal RESP reader: enough for the replies GET/SET/EVAL produce.
function parse(buf) {
  let i = 0;
  function read() {
    const type = buf.charCodeAt(i);
    const end = buf.indexOf('\r\n', i);
    if (end === -1) return undefined;
    const head = buf.slice(i + 1, end);
    if (type === 0x2b /* + */) { i = end + 2; return head; }
    if (type === 0x3a /* : */) { i = end + 2; return Number(head); }
    if (type === 0x2d /* - */) { i = end + 2; return { error: head }; }
    if (type === 0x24 /* $ */) {
      const len = Number(head);
      i = end + 2;
      if (len === -1) return null;
      const val = buf.slice(i, i + len);
      i += len + 2;
      return val;
    }
    if (type === 0x2a /* * */) {
      const n = Number(head);
      i = end + 2;
      const out = [];
      for (let k = 0; k < n; k++) out.push(read());
      return out;
    }
    return undefined;
  }
  const value = read();
  return { value, consumed: i };
}

function command(args) {
  return new Promise((resolve, reject) => {
    const sock = connect(REDIS_PORT, '127.0.0.1', () => sock.write(encode(args)));
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk.toString('binary');
      const out = parse(buf);
      if (out.value !== undefined) {
        sock.end();
        resolve(out.value);
      }
    });
    sock.on('error', reject);
  });
}

createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.statusCode = 401;
    return res.end('unauthorised');
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    const args = JSON.parse(Buffer.concat(chunks).toString());
    const result = await command(args);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ result: result?.error ? null : result }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(err) }));
  }
}).listen(PORT, () => console.log(`upstash shim on :${PORT} -> redis :${REDIS_PORT}`));

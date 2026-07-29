/**
 * Bundles the built app into one self-contained HTML fragment.
 *
 *     npm run build:artifact
 *
 * Publishing surfaces that host a page under a strict CSP — Claude Artifacts
 * among them — block every external request, so the stylesheet, the script and
 * all 125 portraits have to travel inside the file itself. The output is a body
 * fragment rather than a whole document: the host supplies <html>, <head> and
 * <body> around it.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';

const DIST = 'dist';
const PORTRAITS = 'public/members';
const OUT = 'artifact/corp-codenames.html';

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
               '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

/** Pull the hashed asset names out of the built index so this survives rebuilds. */
function assetPath(pattern, label) {
  const match = html.match(pattern);
  if (!match) throw new Error(`No ${label} found in ${DIST}/index.html — run "npm run build" first.`);
  return join(DIST, match[1].replace(/^\//, ''));
}

const script = readFileSync(assetPath(/<script[^>]+src="([^"]+\.js)"/, 'script'), 'utf8');
const style = readFileSync(assetPath(/<link[^>]+href="([^"]+\.css)"/, 'stylesheet'), 'utf8');
const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'Corp Codenames';

// Portraits are referenced from the roster as "members/<file>" and resolved at
// runtime; swapping each for a data URI leaves resolvePhoto() to pass it
// through untouched.
let inlined = script;
const missing = [];
for (const file of readdirSync(PORTRAITS)) {
  const ref = `members/${file}`;
  if (!inlined.includes(ref)) {
    missing.push(file);
    continue;
  }
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) throw new Error(`Unknown image type for ${file}`);
  const data = `data:${mime};base64,${readFileSync(join(PORTRAITS, file)).toString('base64')}`;
  inlined = inlined.split(ref).join(data);
}
if (missing.length) {
  throw new Error(
    `${missing.length} portrait(s) are not referenced by the bundle, so they would ` +
      `be dropped: ${missing.slice(0, 5).join(', ')}`,
  );
}
const stillRelative = inlined.match(/["'`]members\/[^"'`]+/g);
if (stillRelative) throw new Error(`Unresolved portrait references: ${stillRelative.slice(0, 3)}`);

// A literal </script> or </style> inside the payload would close the tag early.
const escape = (source, tag) => source.split(`</${tag}`).join(`<\\/${tag}`);

const fragment = `<title>${title}</title>
<style>
${style}
</style>
<div id="root"></div>
<script type="module">
${escape(inlined, 'script')}
</script>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, fragment, 'utf8');

const kib = (n) => `${Math.round(n / 1024)} KiB`;
console.log(
  `Wrote ${OUT} (${kib(Buffer.byteLength(fragment))})\n` +
    `  ${kib(Buffer.byteLength(style))} styles, ${kib(Buffer.byteLength(script))} script, ` +
    `${readdirSync(PORTRAITS).length} portraits inlined`,
);

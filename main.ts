// Token Radar: build the launch radar from the sealed snapshot.
//
//   node main.ts --input /input --output /output
//
// The snapshot is the sealed /input/snapshot.json; the radar is written to /output:
//   board.json    the ranked board, one row per rankable pre-token protocol
//   data.js       the same board and live set, as the dashboard's data
//   dashboard/    the radar dashboard (index.html, app.js, app.css)
//   screenshots/  screenshots of the dashboard, one per view
//   dossier.json  the board's record for grading, from the vendor library
//
// The same snapshot must build the same bytes twice: nothing here reads a clock or rolls dice.
// Run it twice and diff the two outputs; they are identical.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL, MODEL_VERSION, boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot, MODEL);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board }, null, 2)}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
if (!dashFiles.includes('index.html')) {
  process.stderr.write('token radar: the dashboard has no index.html\n');
  process.exit(1);
}
if (!dashFiles.some((f) => f.endsWith('.css'))) {
  process.stderr.write('token radar: the dashboard has no stylesheet\n');
  process.exit(1);
}
if (!dashFiles.some((f) => f.endsWith('.js'))) {
  process.stderr.write('token radar: the dashboard has no script\n');
  process.exit(1);
}
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
  if (statSync(join(out, 'screenshots', name)).size > SCREENSHOT_CAPS.max_bytes) {
    process.stderr.write(`token radar: screenshots/${name} is over the 512 KiB image limit\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const watchlistRows = board.filter((r) => snapshot.watchlist.includes(r.slug)).length;
const dashBytes = dashFiles.reduce((sum, f) => sum + statSync(join(out, 'dashboard', f)).size, 0);
const shotBytes = shots.reduce((sum, f) => sum + statSync(join(out, 'screenshots', f)).size, 0);
process.stdout.write(
  `token radar: model ${MODEL_VERSION}, ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist\n` +
    `token radar: board ${board.length} rows (${watchlistRows} watchlist, ${board.length - watchlistRows} early), implied $${board[0]!.implied_value_usd.toLocaleString('en-US')} down to $${board[board.length - 1]!.implied_value_usd.toLocaleString('en-US')}\n` +
    `token radar: multiples global ${radar.multiples.global_median}, ${Object.keys(radar.multiples.by_category).length} categories with trading tokens\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files, ${dashBytes} bytes), ${join(out, 'screenshots')} (${shots.length} images, ${shotBytes} bytes) and ${join(out, 'dossier.json')}\n`,
);

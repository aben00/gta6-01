// Sunset Heat — the make.fun entry program (Node 22, standard library
// only). The game is this directory's game/ folder: plain static files a
// desktop browser loads offline (game/index.html and its ES modules, with
// three.js vendored under game/vendor/, no network request). This program
// hands it in: it stages game/ and screenshots/ from beside this file into
// the output directory and writes dossier.json there, the summary the
// judge reads, with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** Where the hand-in goes: MAKEFUN_OUTPUT_DIR, else /output. */
function outputDir(): string {
  return process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

/** How many files a tree holds, directories walked recursively. */
function countFiles(dir: string): number {
  let files = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    files += entry.isDirectory() ? countFiles(path) : 1;
  }
  return files;
}

/** The screenshots in a directory, in name order with their sizes. */
function listShots(dir: string): Array<{ name: string; bytes: number }> {
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .sort()
    .map((name) => ({ name, bytes: statSync(join(dir, name)).size }));
}

/** Stage game/ and screenshots/ beside this file into `out`. */
function stage(out: string): void {
  mkdirSync(out, { recursive: true });
  cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(join(here, 'screenshots'))) {
    cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  }
}

/** The scorer's own caps (reference/gate.json): only text_max_bytes
 * shapes the bytes; the others refuse an entry the scorer would refuse
 * (more than 4 screenshots or one over 256 KiB; more than 993 files in
 * game/ or 48 MiB of game files, in all, or a path under game/ over
 * 1000 bytes). */
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function main(): void {
  const out = outputDir();
  stage(out);

  const dossier = buildDossier(out, DOSSIER_CAPS);
  writeFileSync(join(out, 'dossier.json'), dossier);

  const indexBytes = statSync(join(here, 'game', 'index.html')).size;
  const shots = listShots(join(here, 'screenshots'));
  console.log(`gta6-01 hand-in ready in ${out}`);
  console.log(`dossier.json: ${dossier.length} bytes`);
  console.log(`game/: ${countFiles(join(here, 'game'))} files, index.html ${indexBytes} bytes`);
  console.log(`screenshots/: ${shots.length} image(s) — ${shots.map((s) => `${s.name} (${s.bytes} bytes)`).join(', ')}`);
}

main();

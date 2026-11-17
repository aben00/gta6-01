// SUNSET HEAT — a make.fun gta6-01 entry (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, three.js vendored
// under game/vendor/three/, no network request at all). This file copies
// game/ and screenshots/ from beside it to /output (or $MAKEFUN_OUTPUT_DIR
// outside the grader's container) and writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Build the hand-in with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all, or a path under game/ over 1000 bytes).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// A short build report, so two runs can be compared at a glance: the dossier
// must be byte-identical between runs on the same tree.
console.log(`sunset-heat: wrote ${join(out, 'dossier.json')} (${dossier.length} bytes)`);
console.log(`sunset-heat: game/ is ${statSync(join(out, 'game', 'index.html')).size} bytes at index.html`);

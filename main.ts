// Steel Falcon — a 3D jet-fighter dogfight, built for this bounty entry.
// You fly a MiG-29-style jet from a chase camera over a HD coastal terrain
// with an airbase and runway below, hunting enemy jets driven by AI.
// Controls: pitch and roll with the mouse or arrows, throttle with W/S,
// guns with Space, and lock-on missiles with F once the tone sounds.
// The HUD shows speed, altitude, throttle, ammo, and a radar sweep that
// tracks every hostile in the sky around you.
// All art is procedural: the jet, terrain, clouds, and explosions are
// drawn with raw WebGL, no external assets, and the engine roar, gunfire,
// and missile whoosh are synthesised live with WebAudio.
// The game is plain static files under game/ (index.html plus modules),
// runs fully offline in a desktop browser, and makes no network request.
// This entrypoint copies game/ and screenshots/ beside it into the output
// directory and writes dossier.json, the summary the judge reads.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// These caps keep the entry inside the scorer's limits for Steel Falcon:
// at most four screenshots, a bounded dossier text size, and a game folder
// that stays under the file-count, total-size, and path-length ceilings,
// so a complete, playable build is what the judge receives.

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Steel Falcon — entry for the make.fun best-flight-game bounty
// (best-flight-game-20261126-0057, $500). A 3D jet dogfight rebuilt
// around its visuals: the player's jet and the AI enemies now carry
// far more surface detail, the coastal terrain below is richer, and
// the sky is filled with drifting clouds. A large gold practice ring
// hangs in the air with a beacon and a HUD guide, so the player
// always sees where to fly next.
// Mouse or arrows steer, W/S work the throttle, Space fires the guns,
// and F launches a lock-on missile when the tone sounds. Speed,
// altitude, throttle, ammo, and a radar sweep all show on the HUD.
// Everything visual is procedural WebGL and every sound is live
// WebAudio, so the game needs no downloaded assets and runs offline.
// This entrypoint copies game/ and screenshots/ into the output
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

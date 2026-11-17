// Solmarina's layout: a road grid, the blocks between the roads, the beach and
// the sea on the south edge. This file holds data and canvas textures only —
// no three.js — so the world logic and the renderer can share it. All layout
// comes from the seeded generator, so one seed is one city.

import { CITY, PALETTE } from './config.js';
import { randInt, randPick, randRange } from './random.js';

// Facade colours for the sunset city: warm plaster, brick, teal, sand.
const FACADE_COLORS = [0xb98a6e, 0x9a7f8a, 0x7f9a8a, 0xc2a878, 0x8a7a9a, 0xa86e5e, 0x6e8a9a, 0xd8c2a0];
const CAR_COLORS = [0xc23b2e, 0x2e6ec2, 0xd8a13c, 0x3aa655, 0xd8d8d8, 0x222226, 0x7a4a9a, 0x3cc2b2];

/** Road centre lines, in metres, on one axis. */
export function roadLines() {
  const lines = [];
  for (let v = -180; v <= 180; v += CITY.roadEvery) lines.push(v);
  return lines;
}

/** True when (x, z) is on a road (not on a block, the beach or the sea). */
export function onRoad(x, z) {
  if (z >= CITY.beachZ) return false;
  const hw = CITY.roadWidth / 2;
  for (const line of roadLines()) {
    if (Math.abs(x - line) <= hw || Math.abs(z - line) <= hw) return true;
  }
  return false;
}

/** The nearest point on the road network to (x, z), for respawning traffic. */
export function nearestRoadPoint(x, z) {
  const lines = roadLines();
  let bestX = x;
  let bestZ = z;
  let best = Infinity;
  for (const line of lines) {
    const d = Math.abs(x - line);
    if (d < best) {
      best = d;
      bestX = line;
      bestZ = z;
    }
  }
  best = Infinity;
  for (const line of lines) {
    const d = Math.abs(z - line);
    if (d < best) {
      best = d;
      bestZ = line;
      bestX = x;
    }
  }
  return { x: bestX, z: bestZ };
}

function worldToCanvas(v, size) {
  return ((v + CITY.half) / (CITY.half * 2)) * size;
}

/** The whole ground in one 2048 px canvas: roads, sidewalks, lane dashes, crosswalks, beach, sea. */
export function makeGroundTexture(random) {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const px = (v) => worldToCanvas(v, size);
  const css = (n) => `#${n.toString(16).padStart(6, '0')}`;

  // Base: city blocks.
  g.fillStyle = css(PALETTE.block);
  g.fillRect(0, 0, size, size);
  // Beach and sea on the south edge.
  g.fillStyle = css(PALETTE.sand);
  g.fillRect(0, px(CITY.beachZ), size, size - px(CITY.beachZ));
  g.fillStyle = css(PALETTE.sea);
  g.fillRect(0, px(CITY.waterZ), size, size - px(CITY.waterZ));
  // Wet sand line where the waves meet.
  g.fillStyle = '#a87f52';
  g.fillRect(0, px(CITY.waterZ) - 6, size, 12);
  // Sidewalks: a lighter border around every block.
  const lines = roadLines();
  const halfRoad = CITY.roadWidth / 2;
  const halfSide = halfRoad + 3;
  g.fillStyle = css(PALETTE.sidewalk);
  for (let i = 0; i < lines.length - 1; i += 1) {
    for (let j = 0; j < lines.length - 1; j += 1) {
      const x0 = lines[i] + halfSide;
      const x1 = lines[i + 1] - halfSide;
      const z0 = lines[j] + halfSide;
      const z1 = lines[j + 1] - halfSide;
      if (z1 > CITY.beachZ) continue;
      g.fillRect(px(x0), px(z0), px(x1) - px(x0), px(z1) - px(z0));
    }
  }
  // Roads.
  g.fillStyle = css(PALETTE.road);
  for (const line of lines) {
    g.fillRect(0, px(line - halfRoad), size, px(line + halfRoad) - px(line - halfRoad));
    g.fillRect(px(line - halfRoad), 0, px(line + halfRoad) - px(line - halfRoad), px(CITY.beachZ));
  }
  // Lane dashes.
  g.fillStyle = css(PALETTE.roadLine);
  const dash = 14;
  const gap = 18;
  for (const line of lines) {
    for (let v = -CITY.half; v < CITY.half; v += dash + gap) {
      g.fillRect(px(v), px(line) - 2, px(v + dash) - px(v), 4);
      if (line < CITY.beachZ) g.fillRect(px(line) - 2, px(v), 4, px(v + dash) - px(v));
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = '#c8c8cc';
  for (const lx of lines) {
    for (const lz of lines) {
      for (let k = -3; k <= 3; k += 1) {
        g.fillRect(px(lx + k * 1.6) - 3, px(lz - halfRoad) + 2, 6, 8);
        g.fillRect(px(lx + k * 1.6) - 3, px(lz + halfRoad) - 10, 6, 8);
      }
    }
  }
  // A few oil stains and cracks for life.
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 90; i += 1) {
    const x = random() * size;
    const y = random() * px(CITY.beachZ);
    g.beginPath();
    g.ellipse(x, y, 4 + random() * 14, 3 + random() * 8, random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return canvas;
}

/** A shared facade texture: dark glass with some windows lit warm for dusk. */
export function makeFacadeTexture(random) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  const cols = 5;
  const rows = 10;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = random() < 0.42;
      g.fillStyle = lit ? '#ffc46b' : '#232038';
      g.fillRect(8 + c * 24, 10 + r * 24, 14, 16);
    }
  }
  return canvas;
}

/** Buildings, palms and lamps for one seed. Buildings carry their AABB. */
export function buildCity(random) {
  const lines = roadLines();
  const buildings = [];
  const palms = [];
  const lamps = [];
  const inset = CITY.blockInset;
  const halfRoad = CITY.roadWidth / 2;

  for (let i = 0; i < lines.length - 1; i += 1) {
    for (let j = 0; j < lines.length - 1; j += 1) {
      const x0 = lines[i] + halfRoad + inset;
      const x1 = lines[i + 1] - halfRoad - inset;
      const z0 = lines[j] + halfRoad + inset;
      const z1 = lines[j + 1] - halfRoad - inset;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      // The central plaza: no buildings, palms and open space instead.
      if (Math.abs(cx) < 35 && Math.abs(cz) < 35) {
        for (let k = 0; k < 6; k += 1) {
          palms.push({ x: cx + randRange(random, -22, 22), z: cz + randRange(random, -22, 22) });
        }
        continue;
      }
      // Beachfront blocks stay low and open.
      if (z0 >= CITY.beachZ - 60) continue;
      const count = randInt(random, 1, 3);
      for (let k = 0; k < count; k += 1) {
        const w = randRange(random, 12, 22);
        const d = randRange(random, 12, 22);
        const x = randRange(random, x0 + w / 2, x1 - w / 2);
        const z = randRange(random, z0 + d / 2, z1 - d / 2);
        const h = randPick(random, [8, 10, 12, 15, 18, 24, 30, 38]) + randRange(random, 0, 4);
        buildings.push({
          x, z, w, d, h,
          hw: w / 2, hd: d / 2,
          color: randPick(random, FACADE_COLORS),
          roof: randPick(random, [0x3a3f4a, 0x4a3a3f, 0x39424a]),
        });
      }
      // A palm or two on the block corners, and a lamp at the intersection.
      if (random() < 0.5) palms.push({ x: x0 + 2, z: z0 + 2 });
      if (random() < 0.4) palms.push({ x: x1 - 2, z: z1 - 2 });
      lamps.push({ x: lines[i] + halfRoad + 1.5, z: lines[j] + halfRoad + 1.5 });
    }
  }
  // Palm row along the beachfront road.
  for (let x = -180; x <= 180; x += 30) {
    palms.push({ x: x + randRange(random, -4, 4), z: CITY.beachZ - 8 });
  }
  return { buildings, palms, lamps, carColors: CAR_COLORS };
}

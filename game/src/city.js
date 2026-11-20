// Solmarina itself: the static city.
//
// generateLayout rolls the city from a seed (building footprints, lamps,
// palms, boats); buildCity turns that layout into three.js meshes. All
// ~80 buildings merge into ONE mesh, the lamps into one more, the boats
// into one more — the whole static city is a handful of draw calls, which
// is what keeps the frame cheap.
//
// The ground is a single plane wearing a canvas texture: asphalt, blocks,
// sidewalks, crosswalks, lane dashes and the sand strip are all painted
// once, at boot, instead of being geometry.

import * as THREE from 'three';
import { COLORS, HIDDEN_CASH, ISLAND, PLACES, STREETS } from './config.js';

/** Facade tints: warm dusk oranges and greys, like the screenshots. */
const FACADE_TINTS = [0xffffff, 0xffd9b0, 0xffc9a0, 0xd8d0c8, 0xe8b088, 0xc9b8a6, 0xf2a56b];

/** True when (x, z) lies within `radius` of any spot in `spots`. */
function closeToSpot(x, z, spots, radius) {
  for (const s of spots) {
    if (Math.hypot(s.x - x, s.z - z) < radius) return true;
  }
  return false;
}

/**
 * Fold boxes into one BufferGeometry. Each part is
 * {w,h,d, x,y,z, ry, color}; when `facade` is set the UVs are scaled so
 * the window texture repeats every few metres instead of stretching.
 */
class PartMerger {
  constructor(facade) {
    this.facade = facade;
    this.position = [];
    this.normal = [];
    this.uv = [];
    this.color = [];
    this.index = [];
    this.base = 0;
    this.tint = new THREE.Color();
  }

  /** Scale a tower's UVs so windows stay the same size on any height. */
  scaleFacadeUVs(geo, part) {
    // BoxGeometry faces run +x -x +y -y +z -z; each face's UVs scale by
    // its real-world size so windows stay the same size on any tower.
    const faceSize = [
      [part.d, part.h], [part.d, part.h], [part.w, part.d],
      [part.w, part.d], [part.w, part.h], [part.w, part.h],
    ];
    const uv = geo.attributes.uv;
    for (let v = 0; v < uv.count; v += 1) {
      const face = Math.floor(v / 4);
      uv.setXY(v, uv.getX(v) * (faceSize[face][0] / 13), uv.getY(v) * (faceSize[face][1] / 21));
    }
  }

  add(part) {
    const geo = new THREE.BoxGeometry(part.w, part.h, part.d);
    if (this.facade) this.scaleFacadeUVs(geo, part);
    const matrix = new THREE.Matrix4().makeRotationY(part.ry || 0);
    matrix.setPosition(part.x, part.y, part.z);
    geo.applyMatrix4(matrix);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uvAttr = geo.attributes.uv;
    this.tint.setHex(part.color);
    for (let v = 0; v < pos.count; v += 1) {
      this.position.push(pos.getX(v), pos.getY(v), pos.getZ(v));
      this.normal.push(nor.getX(v), nor.getY(v), nor.getZ(v));
      this.uv.push(uvAttr.getX(v), uvAttr.getY(v));
      this.color.push(this.tint.r, this.tint.g, this.tint.b);
    }
    const index = geo.index;
    for (let i = 0; i < index.count; i += 1) this.index.push(index.getX(i) + this.base);
    this.base += pos.count;
    geo.dispose();
    return this;
  }

  build() {
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    merged.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    merged.setIndex(this.index);
    return merged;
  }
}

/** Merge a list of parts into one geometry, facades optional. */
function mergeParts(parts, facade) {
  const merger = new PartMerger(facade);
  for (const part of parts) merger.add(part);
  return merger.build();
}

/** Roll one plot's buildings into `out`, skipping the cleared spots. */
function placePlotBuildings(random, plot, out) {
  const keepClear = [PLACES.marina, PLACES.pier, PLACES.safehouse];
  if (closeToSpot(plot.x, plot.z, keepClear, 18)) return;
  const pair = random.chance(0.35);
  const offsets = pair ? [-11, 11] : [0];
  for (const off of offsets) {
    const w = random.range(18, pair ? 20 : 34);
    const d = random.range(18, pair ? 20 : 34);
    const x = plot.x + off;
    const z = plot.z + (pair ? random.range(-8, 8) : 0);
    if (closeToSpot(x, z, HIDDEN_CASH, 9)) continue;
    out.push({
      x, z, w, d,
      h: 10 + random.next() * random.next() * 38,
      tint: random.pick(FACADE_TINTS),
    });
  }
}

/** Roll the lamps: a 55% chance at each intersection's corner. */
function rollLamps(random) {
  const lamps = [];
  for (let x = -240; x <= 240; x += STREETS.every) {
    for (let z = -240; z <= 240; z += STREETS.every) {
      if (random.chance(0.55)) lamps.push({ x: x + 9, z: z + 9 });
    }
  }
  return lamps;
}

/** Roll the palms along the beach strip. */
function rollPalms(random) {
  const palms = [];
  for (let i = 0; i < 12; i += 1) {
    palms.push({
      x: random.range(-250, 250),
      z: random.range(226, 236),
      lean: random.range(-0.12, 0.12),
    });
  }
  return palms;
}

/** Roll the five boats riding in the sea. */
function rollBoats(random) {
  const boats = [];
  for (let i = 0; i < 5; i += 1) {
    boats.push({
      x: 40 + i * 52 + random.range(-8, 8),
      z: random.range(300, 332),
      yaw: random.range(-0.5, 0.5),
    });
  }
  return boats;
}

/**
 * Roll the city layout from the seed. Pure data — no three.js in here.
 * The draws happen in a fixed order (plots, lamps, palms, boats) so one
 * seed always lays out the same city.
 */
export function generateLayout(random) {
  const buildings = [];
  for (let x = -210; x <= 210; x += STREETS.every) {
    for (let z = -210; z <= 210; z += STREETS.every) {
      placePlotBuildings(random, { x, z }, buildings);
    }
  }
  return {
    buildings,
    lamps: rollLamps(random),
    palms: rollPalms(random),
    boats: rollBoats(random),
  };
}

/** One facade texture: a pale wall with a grid of windows, some lit warm. */
function paintFacade(random) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b8b0a8';
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      ctx.fillStyle = random.next() < 0.45 ? '#ffb45e' : '#23202e';
      ctx.fillRect(10 + col * 30, 12 + row * 30, 18, 20);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** City blocks: slightly lighter slabs with a sidewalk rim. */
function paintBlocks(ctx, toU, toV) {
  ctx.fillStyle = '#322d38';
  ctx.strokeStyle = '#3d3742';
  ctx.lineWidth = 3;
  for (let x = -240; x <= 240; x += STREETS.every) {
    for (let z = -240; z <= 240; z += STREETS.every) {
      const x0 = toU(x - 24);
      const y0 = toV(z - 24);
      const w = toU(x + 24) - x0;
      const h = toV(z + 24) - y0;
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeRect(x0, y0, w, h);
    }
  }
}

/** Yellow centre dashes along every street. */
function paintDashes(ctx, toU, toV) {
  ctx.fillStyle = '#c9973f';
  for (let x = -240; x <= 240; x += STREETS.every) {
    for (let z = -270; z <= 270; z += 18) ctx.fillRect(toU(x) - 1, toV(z), 2, 7);
  }
  for (let z = -240; z <= 240; z += STREETS.every) {
    for (let x = -270; x <= 270; x += 18) ctx.fillRect(toU(x), toV(z) - 1, 7, 2);
  }
}

/** Crosswalks at every intersection. */
function paintCrosswalks(ctx, toU, toV) {
  ctx.fillStyle = 'rgba(230, 225, 235, 0.5)';
  for (let x = -240; x <= 240; x += STREETS.every) {
    for (let z = -240; z <= 240; z += STREETS.every) {
      for (let i = -2; i <= 2; i += 1) {
        ctx.fillRect(toU(x + i * 4) - 1, toV(z - 9), 2, 18);
        ctx.fillRect(toU(x - 9), toV(z + i * 4) - 1, 18, 2);
      }
    }
  }
}

/** The sand strip, north of the beach line, with speckles. */
function paintSand(ctx, toU, toV, size) {
  ctx.fillStyle = '#c9a06a';
  ctx.fillRect(0, toV(ISLAND.sandAt), size, size - toV(ISLAND.sandAt));
  ctx.fillStyle = 'rgba(120, 85, 40, 0.35)';
  for (let i = 0; i < 500; i += 1) {
    ctx.fillRect(Math.random() * size, toV(ISLAND.sandAt) + Math.random() * (size - toV(ISLAND.sandAt)), 2, 2);
  }
}

/** Paint the ground: roads, blocks, sidewalks, dashes, crosswalks, sand. */
function paintGround() {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const toU = (x) => ((x - ISLAND.west) / (ISLAND.east - ISLAND.west)) * S;
  const toV = (z) => ((z - ISLAND.south) / (ISLAND.north - ISLAND.south)) * S;
  ctx.fillStyle = '#26222c';
  ctx.fillRect(0, 0, S, S);
  paintBlocks(ctx, toU, toV);
  paintDashes(ctx, toU, toV);
  paintCrosswalks(ctx, toU, toV);
  paintSand(ctx, toU, toV, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The painted ground plane and the sea plane, under everything else. */
function addGroundAndSea(group) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ISLAND.east - ISLAND.west, ISLAND.north - ISLAND.south),
    new THREE.MeshLambertMaterial({ map: paintGround() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, (ISLAND.south + ISLAND.north) / 2);
  group.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 280),
    new THREE.MeshLambertMaterial({ color: COLORS.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.05, ISLAND.waterAt + 140);
  group.add(sea);
}

/** The towers: every building in the layout, one merged mesh. */
function addTowers(group, layout, random, colliders) {
  const towerParts = layout.buildings.map((b) => ({
    w: b.w, h: b.h, d: b.d, x: b.x, y: b.h / 2, z: b.z, color: b.tint,
  }));
  const towers = new THREE.Mesh(
    mergeParts(towerParts, true),
    new THREE.MeshLambertMaterial({ map: paintFacade(random), vertexColors: true }),
  );
  group.add(towers);
  for (const b of layout.buildings) {
    colliders.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
  }
}

/** Street lamps: dark poles in one mesh, warm heads in another. */
function addLamps(group, layout) {
  const poles = layout.lamps.map((l) => ({ w: 0.25, h: 7, d: 0.25, x: l.x, y: 3.5, z: l.z, color: 0x1c1a20 }));
  const heads = layout.lamps.map((l) => ({ w: 0.9, h: 0.3, d: 0.5, x: l.x, y: 7.1, z: l.z, color: 0xffffff }));
  group.add(new THREE.Mesh(mergeParts(poles, false), new THREE.MeshLambertMaterial({ vertexColors: true })));
  group.add(new THREE.Mesh(mergeParts(heads, false), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffd9a0 })));
}

/** Palms along the beach: trunk plus a green crown, one mesh. */
function addPalms(group, layout) {
  const palmParts = [];
  for (const p of layout.palms) {
    palmParts.push({ w: 0.5, h: 6, d: 0.5, x: p.x, y: 3, z: p.z, ry: p.lean, color: 0x6b4a2f });
    palmParts.push({ w: 3.4, h: 1.2, d: 3.4, x: p.x, y: 6.6, z: p.z, color: 0x2f7a3d });
  }
  group.add(new THREE.Mesh(mergeParts(palmParts, false), new THREE.MeshLambertMaterial({ vertexColors: true })));
}

/** The wooden pier at the mission-2 beach, running out into the sea. */
function addPier(group) {
  const pier = PLACES.pier;
  const pierParts = [];
  for (let z = ISLAND.sandAt - 4; z <= ISLAND.waterAt + 34; z += 3) {
    pierParts.push({ w: 8, h: 0.35, d: 2.6, x: pier.x, y: 0.45, z, color: 0x8a6238 });
  }
  for (let z = ISLAND.sandAt; z <= ISLAND.waterAt + 30; z += 12) {
    pierParts.push({ w: 0.5, h: 1.6, d: 0.5, x: pier.x - 3.6, y: 0.2, z, color: 0x5f4023 });
    pierParts.push({ w: 0.5, h: 1.6, d: 0.5, x: pier.x + 3.6, y: 0.2, z, color: 0x5f4023 });
  }
  group.add(new THREE.Mesh(mergeParts(pierParts, false), new THREE.MeshLambertMaterial({ vertexColors: true })));
}

/** Five boats riding in the sea, one merged mesh. */
function addBoats(group, layout) {
  const boatParts = [];
  for (const b of layout.boats) {
    boatParts.push({ w: 3, h: 1, d: 8, x: b.x, y: 0.5, z: b.z, ry: b.yaw, color: 0xd8d2c8 });
    boatParts.push({ w: 2, h: 1.4, d: 3, x: b.x, y: 1.6, z: b.z, ry: b.yaw, color: 0x3f6d8e });
  }
  group.add(new THREE.Mesh(mergeParts(boatParts, false), new THREE.MeshLambertMaterial({ vertexColors: true })));
}

/** The green safehouse: a landmark, not just a box. */
function addSafehouse(group, colliders) {
  const safehouse = PLACES.safehouse;
  const house = new THREE.Mesh(
    mergeParts([
      { w: 11, h: 5.5, d: 8, x: safehouse.x, y: 2.75, z: safehouse.z, color: COLORS.safehouse },
      { w: 12, h: 0.8, d: 9, x: safehouse.x, y: 5.9, z: safehouse.z, color: 0x20301f },
      { w: 2.4, h: 3.4, d: 0.4, x: safehouse.x, y: 1.7, z: safehouse.z + 4.1, color: 0x2a1c10 },
    ], false),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  group.add(house);
  colliders.push({ minX: safehouse.x - 5.5, maxX: safehouse.x + 5.5, minZ: safehouse.z - 4, maxZ: safehouse.z + 4 });
}

/** The marina kiosk by the mission-1 marker. */
function addKiosk(group, colliders) {
  const marina = PLACES.marina;
  const kiosk = new THREE.Mesh(
    mergeParts([
      { w: 6, h: 3.4, d: 5, x: marina.x, y: 1.7, z: marina.z, color: 0x7a5a3a },
      { w: 7, h: 0.5, d: 6, x: marina.x, y: 3.6, z: marina.z, color: 0x2e4a6b },
    ], false),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  group.add(kiosk);
  colliders.push({ minX: marina.x - 3, maxX: marina.x + 3, minZ: marina.z - 2.5, maxZ: marina.z + 2.5 });
}

/** Build every static mesh from the layout and add it to the scene. */
export function buildCity(scene, layout, random) {
  const group = new THREE.Group();
  const colliders = [];
  addGroundAndSea(group);
  addTowers(group, layout, random, colliders);
  addLamps(group, layout);
  addPalms(group, layout);
  addPier(group);
  addBoats(group, layout);
  addSafehouse(group, colliders);
  addKiosk(group, colliders);
  scene.add(group);
  return { group, colliders };
}

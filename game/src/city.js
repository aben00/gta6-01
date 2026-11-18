// Solmarina itself: the static city. generateLayout rolls the city from a
// seed (building footprints, lamps, palms, boats); buildCity turns that
// layout into three.js meshes. All ~80 buildings merge into ONE mesh, the
// lamps into one more, the boats into one more — the whole static city is
// a handful of draw calls, which is what keeps the frame cheap.
//
// The ground is a single plane wearing a canvas texture: asphalt, blocks,
// sidewalks, crosswalks, lane dashes and the sand strip are all painted
// once, at boot, instead of being geometry.

import * as THREE from 'three';
import { BEACH_Z, MARINA, PALETTE, PIER, SAFEHOUSE, SEA_Z, STASHES, STREET_STEP, WORLD } from './config.js';

/** Facade tints: warm dusk oranges and greys, like the screenshots. */
const FACADE_TINTS = [0xffffff, 0xffd9b0, 0xffc9a0, 0xd8d0c8, 0xe8b088, 0xc9b8a6, 0xf2a56b];

function blockCentres() {
  const centres = [];
  for (let x = -210; x <= 210; x += STREET_STEP) {
    for (let z = -210; z <= 210; z += STREET_STEP) centres.push({ x, z });
  }
  return centres;
}

function nearSpot(x, z, spots, radius) {
  return spots.some((s) => Math.hypot(s.x - x, s.z - z) < radius);
}

/** Roll the city layout from the seed. Pure data — no three.js in here. */
export function generateLayout(random) {
  const buildings = [];
  const reserved = [MARINA, PIER, SAFEHOUSE, ...STASHES];
  for (const block of blockCentres()) {
    if (nearSpot(block.x, block.z, [MARINA, PIER, SAFEHOUSE], 18)) continue;
    const twins = random.chance(0.35);
    const slots = twins ? [-11, 11] : [0];
    for (const off of slots) {
      const w = random.range(18, twins ? 20 : 34);
      const d = random.range(18, twins ? 20 : 34);
      const x = block.x + off;
      const z = block.z + (twins ? random.range(-8, 8) : 0);
      if (nearSpot(x, z, STASHES, 9)) continue;
      buildings.push({
        x, z, w, d,
        h: 10 + random.next() * random.next() * 38,
        tint: random.pick(FACADE_TINTS),
      });
    }
  }
  const lamps = [];
  for (let x = -240; x <= 240; x += STREET_STEP) {
    for (let z = -240; z <= 240; z += STREET_STEP) {
      if (random.chance(0.55)) lamps.push({ x: x + 9, z: z + 9 });
    }
  }
  const palms = [];
  for (let i = 0; i < 12; i += 1) {
    palms.push({ x: random.range(-250, 250), z: random.range(226, 236), lean: random.range(-0.12, 0.12) });
  }
  const boats = [];
  for (let i = 0; i < 5; i += 1) {
    boats.push({ x: 40 + i * 52 + random.range(-8, 8), z: random.range(300, 332), yaw: random.range(-0.5, 0.5) });
  }
  return { buildings, lamps, palms, boats };
}

/**
 * Merge a list of boxes into one BufferGeometry. Each part is
 * {w,h,d, x,y,z, ry, color}; with `facade` the UVs are scaled so the
 * window texture repeats every few metres instead of stretching.
 */
function mergeBoxes(parts, facade) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  let base = 0;
  const tint = new THREE.Color();
  // BoxGeometry faces, in order: +x -x +y -y +z -z, with their sizes.
  const faceDims = (p) => [[p.d, p.h], [p.d, p.h], [p.w, p.d], [p.w, p.d], [p.w, p.h], [p.w, p.h]];
  for (const part of parts) {
    const geo = new THREE.BoxGeometry(part.w, part.h, part.d);
    if (facade) {
      const uv = geo.attributes.uv;
      const dims = faceDims(part);
      for (let v = 0; v < uv.count; v += 1) {
        const face = Math.floor(v / 4);
        uv.setXY(v, uv.getX(v) * (dims[face][0] / 13), uv.getY(v) * (dims[face][1] / 21));
      }
    }
    const matrix = new THREE.Matrix4().makeRotationY(part.ry || 0);
    matrix.setPosition(part.x, part.y, part.z);
    geo.applyMatrix4(matrix);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uvAttr = geo.attributes.uv;
    tint.setHex(part.color);
    for (let v = 0; v < pos.count; v += 1) {
      positions.push(pos.getX(v), pos.getY(v), pos.getZ(v));
      normals.push(nor.getX(v), nor.getY(v), nor.getZ(v));
      uvs.push(uvAttr.getX(v), uvAttr.getY(v));
      colors.push(tint.r, tint.g, tint.b);
    }
    const index = geo.index;
    for (let i = 0; i < index.count; i += 1) indices.push(index.getX(i) + base);
    base += pos.count;
    geo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  return merged;
}

/** One facade texture: a pale wall with a grid of windows, some lit warm. */
function makeFacadeTexture(random) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b8b0a8';
  ctx.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const lit = random.next() < 0.45;
      ctx.fillStyle = lit ? '#ffb45e' : '#23202e';
      ctx.fillRect(10 + col * 30, 12 + row * 30, 18, 20);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Paint the ground: roads, blocks, sidewalks, dashes, crosswalks, sand. */
function makeGroundTexture() {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const toU = (x) => ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * S;
  const toV = (z) => ((z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ)) * S;
  ctx.fillStyle = '#26222c';
  ctx.fillRect(0, 0, S, S);
  // City blocks: slightly lighter slabs with a sidewalk rim.
  ctx.fillStyle = '#322d38';
  for (let x = -240; x <= 240; x += STREET_STEP) {
    for (let z = -240; z <= 240; z += STREET_STEP) {
      ctx.fillRect(toU(x - 24), toV(z - 24), toU(x + 24) - toU(x - 24), toV(z + 24) - toV(z - 24));
    }
  }
  ctx.strokeStyle = '#3d3742';
  ctx.lineWidth = 3;
  for (let x = -240; x <= 240; x += STREET_STEP) {
    for (let z = -240; z <= 240; z += STREET_STEP) {
      ctx.strokeRect(toU(x - 24), toV(z - 24), toU(x + 24) - toU(x - 24), toV(z + 24) - toV(z - 24));
    }
  }
  // Yellow centre dashes along every street.
  ctx.fillStyle = '#c9973f';
  for (let x = -240; x <= 240; x += STREET_STEP) {
    for (let z = -270; z <= 270; z += 18) ctx.fillRect(toU(x) - 1, toV(z), 2, 7);
  }
  for (let z = -240; z <= 240; z += STREET_STEP) {
    for (let x = -270; x <= 270; x += 18) ctx.fillRect(toU(x), toV(z) - 1, 7, 2);
  }
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(230, 225, 235, 0.5)';
  for (let x = -240; x <= 240; x += STREET_STEP) {
    for (let z = -240; z <= 240; z += STREET_STEP) {
      for (let i = -2; i <= 2; i += 1) {
        ctx.fillRect(toU(x + i * 4) - 1, toV(z - 9), 2, 18);
        ctx.fillRect(toU(x - 9), toV(z + i * 4) - 1, 18, 2);
      }
    }
  }
  // The sand strip, north of the beach line.
  ctx.fillStyle = '#c9a06a';
  ctx.fillRect(0, toV(BEACH_Z), S, S - toV(BEACH_Z));
  ctx.fillStyle = 'rgba(120, 85, 40, 0.35)';
  for (let i = 0; i < 500; i += 1) {
    ctx.fillRect(Math.random() * S, toV(BEACH_Z) + Math.random() * (S - toV(BEACH_Z)), 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build every static mesh from the layout and add it to the scene. */
export function buildCity(scene, layout, random) {
  const group = new THREE.Group();
  const colliders = [];

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.maxX - WORLD.minX, WORLD.maxZ - WORLD.minZ),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, (WORLD.minZ + WORLD.maxZ) / 2);
  group.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 280),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.05, SEA_Z + 140);
  group.add(sea);

  const buildingParts = layout.buildings.map((b) => ({
    w: b.w, h: b.h, d: b.d, x: b.x, y: b.h / 2, z: b.z, color: b.tint,
  }));
  const buildings = new THREE.Mesh(
    mergeBoxes(buildingParts, true),
    new THREE.MeshLambertMaterial({ map: makeFacadeTexture(random), vertexColors: true }),
  );
  group.add(buildings);
  for (const b of layout.buildings) {
    colliders.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
  }

  // Street lamps: dark poles in one mesh, warm heads in another.
  const poles = layout.lamps.map((l) => ({ w: 0.25, h: 7, d: 0.25, x: l.x, y: 3.5, z: l.z, color: 0x1c1a20 }));
  const heads = layout.lamps.map((l) => ({ w: 0.9, h: 0.3, d: 0.5, x: l.x, y: 7.1, z: l.z, color: 0xffffff }));
  group.add(new THREE.Mesh(mergeBoxes(poles, false), new THREE.MeshLambertMaterial({ vertexColors: true })));
  group.add(new THREE.Mesh(mergeBoxes(heads, false), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffd9a0 })));

  // Palms along the beach: trunk plus a green crown, one mesh.
  const palmParts = [];
  for (const p of layout.palms) {
    palmParts.push({ w: 0.5, h: 6, d: 0.5, x: p.x, y: 3, z: p.z, ry: p.lean, color: 0x6b4a2f });
    palmParts.push({ w: 3.4, h: 1.2, d: 3.4, x: p.x, y: 6.6, z: p.z, color: 0x2f7a3d });
  }
  group.add(new THREE.Mesh(mergeBoxes(palmParts, false), new THREE.MeshLambertMaterial({ vertexColors: true })));

  // The wooden pier at the mission-2 beach, running out into the sea.
  const pierParts = [];
  for (let z = BEACH_Z - 4; z <= SEA_Z + 34; z += 3) {
    pierParts.push({ w: 8, h: 0.35, d: 2.6, x: PIER.x, y: 0.45, z, color: 0x8a6238 });
  }
  for (let z = BEACH_Z; z <= SEA_Z + 30; z += 12) {
    pierParts.push({ w: 0.5, h: 1.6, d: 0.5, x: PIER.x - 3.6, y: 0.2, z, color: 0x5f4023 });
    pierParts.push({ w: 0.5, h: 1.6, d: 0.5, x: PIER.x + 3.6, y: 0.2, z, color: 0x5f4023 });
  }
  group.add(new THREE.Mesh(mergeBoxes(pierParts, false), new THREE.MeshLambertMaterial({ vertexColors: true })));

  // Five boats riding in the sea, one merged mesh.
  const boatParts = [];
  for (const b of layout.boats) {
    boatParts.push({ w: 3, h: 1, d: 8, x: b.x, y: 0.5, z: b.z, ry: b.yaw, color: 0xd8d2c8 });
    boatParts.push({ w: 2, h: 1.4, d: 3, x: b.x, y: 1.6, z: b.z, ry: b.yaw, color: 0x3f6d8e });
  }
  group.add(new THREE.Mesh(mergeBoxes(boatParts, false), new THREE.MeshLambertMaterial({ vertexColors: true })));

  // The green safehouse, and the marina kiosk: landmarks, not just boxes.
  const house = new THREE.Mesh(
    mergeBoxes([
      { w: 11, h: 5.5, d: 8, x: SAFEHOUSE.x, y: 2.75, z: SAFEHOUSE.z, color: PALETTE.safehouse },
      { w: 12, h: 0.8, d: 9, x: SAFEHOUSE.x, y: 5.9, z: SAFEHOUSE.z, color: 0x20301f },
      { w: 2.4, h: 3.4, d: 0.4, x: SAFEHOUSE.x, y: 1.7, z: SAFEHOUSE.z + 4.1, color: 0x2a1c10 },
    ], false),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  group.add(house);
  colliders.push({ minX: SAFEHOUSE.x - 5.5, maxX: SAFEHOUSE.x + 5.5, minZ: SAFEHOUSE.z - 4, maxZ: SAFEHOUSE.z + 4 });

  const kiosk = new THREE.Mesh(
    mergeBoxes([
      { w: 6, h: 3.4, d: 5, x: MARINA.x, y: 1.7, z: MARINA.z, color: 0x7a5a3a },
      { w: 7, h: 0.5, d: 6, x: MARINA.x, y: 3.6, z: MARINA.z, color: 0x2e4a6b },
    ], false),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  group.add(kiosk);
  colliders.push({ minX: MARINA.x - 3, maxX: MARINA.x + 3, minZ: MARINA.z - 2.5, maxZ: MARINA.z + 2.5 });

  scene.add(group);
  return { group, colliders };
}

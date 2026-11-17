// SUNSET HEAT — drawing only: the three.js scene, the chase camera, the DOM
// HUD and the minimap. The world state in, pixels out. Static city geometry
// (palms, lamps, roofs) is merged into single meshes; buildings keep their
// facade texture; cars and people are small merged box characters so a frame
// stays cheap in software rendering.

import * as THREE from 'three';
import { CITY, MISSIONS, PALETTE } from './config.js';
import { makeFacadeTexture, makeGroundTexture } from './city.js';

const TAU = Math.PI * 2;

/** Merge a list of transformed BoxGeometries (with uv + optional color per box) into one. */
function mergeBoxes(parts) {
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    vCount += p.geo.attributes.position.count;
    iCount += p.geo.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const norm = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let v = 0;
  let k = 0;
  const color = new THREE.Color();
  for (const p of parts) {
    const g = p.geo;
    color.set(p.color ?? 0xffffff);
    pos.set(g.attributes.position.array, v * 3);
    norm.set(g.attributes.normal.array, v * 3);
    uv.set(g.attributes.uv.array, v * 2);
    for (let i = 0; i < g.attributes.position.count; i += 1) {
      col[(v + i) * 3] = color.r;
      col[(v + i) * 3 + 1] = color.g;
      col[(v + i) * 3 + 2] = color.b;
    }
    const src = g.index.array;
    for (let i = 0; i < src.length; i += 1) idx[k + i] = src[i] + v;
    k += src.length;
    v += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function box(w, h, d, x, y, z, color, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry !== 0) g.rotateY(ry);
  g.translate(x, y, z);
  return { geo: g, color };
}

function css(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** A low-poly person: torso+head+arms in one mesh, legs separate so they swing. */
function makePerson(bodyColor, skinColor, pantsColor) {
  const group = new THREE.Group();
  const torsoGeo = mergeBoxes([
    box(0.62, 0.72, 0.34, 0, 1.18, 0, bodyColor), // torso
    box(0.34, 0.34, 0.32, 0, 1.78, 0, skinColor), // head
    box(0.16, 0.62, 0.16, -0.42, 1.18, 0, bodyColor), // left arm
    box(0.16, 0.62, 0.16, 0.42, 1.18, 0, bodyColor), // right arm (static for peds)
  ]);
  const torso = new THREE.Mesh(torsoGeo, personMaterial);
  torso.castShadow = true;
  group.add(torso);
  const legGeoL = new THREE.BoxGeometry(0.22, 0.8, 0.22);
  legGeoL.translate(0, -0.4, 0);
  const legGeoR = new THREE.BoxGeometry(0.22, 0.8, 0.22);
  legGeoR.translate(0, -0.4, 0);
  const legL = new THREE.Mesh(legGeoL, pantsMaterial);
  const legR = new THREE.Mesh(legGeoR, pantsMaterial);
  legL.position.set(-0.15, 0.82, 0);
  legR.position.set(0.15, 0.82, 0);
  legL.castShadow = true;
  legR.castShadow = true;
  group.add(legL);
  group.add(legR);
  return { group, torso, legL, legR };
}

let personMaterial = null;
let pantsMaterial = null;

export function createRenderer(canvas, hud, opts = {}) {
  // Software rendering (SwiftShader/llvmpipe) cannot hold this scene with
  // antialiasing and shadows: detect it once, before creating the renderer,
  // and start on the fast path. Real GPUs get the full path. Screenshot
  // staging (opts.highQuality) always gets the full path — it paints two
  // frames, so speed does not matter there.
  function isSoftwareGL() {
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return /swiftshader|llvmpipe|software|basic render/i.test(name);
    } catch {
      return false;
    }
  }
  const software = !opts.highQuality && isSoftwareGL();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !software });
  renderer.setPixelRatio(software ? 0.66 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x33184a);
  scene.fog = new THREE.Fog(0x4a3455, 70, 420);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.dirLight, 2.3);
  sun.position.set(-120, 90, 180);
  sun.castShadow = !software;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.002;
  scene.add(sun);
  scene.add(sun.target);

  // The setting sun over the sea: a glowing sprite low on the horizon.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 256;
  glowCanvas.height = 256;
  const gg = glowCanvas.getContext('2d');
  const grad = gg.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255, 220, 160, 1)');
  grad.addColorStop(0.25, 'rgba(255, 170, 90, 0.85)');
  grad.addColorStop(0.6, 'rgba(255, 110, 60, 0.28)');
  grad.addColorStop(1, 'rgba(255, 110, 60, 0)');
  gg.fillStyle = grad;
  gg.fillRect(0, 0, 256, 256);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false }));
  sunSprite.position.set(-140, 34, 430);
  sunSprite.scale.set(260, 260, 1);
  scene.add(sunSprite);
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false, opacity: 0.95 }));
  sunCore.position.set(-140, 30, 428);
  sunCore.scale.set(90, 90, 1);
  scene.add(sunCore);

  personMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  pantsMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });

  // --- static city ---------------------------------------------------------
  let cityGroup = null;
  let buildingMeshes = [];
  let beacon = null;
  let beaconDiamond = null;
  let groundTexRef = null;
  const carMeshes = new Map(); // car id -> { group, lightBar }
  const personMeshes = new Map(); // object -> meshes
  let playerMeshes = null;

  function buildStatic(city, random) {
    if (cityGroup) {
      scene.remove(cityGroup);
      cityGroup = null;
    }
    cityGroup = new THREE.Group();
    buildingMeshes = [];

    // Ground: one big textured plane.
    const groundTex = new THREE.CanvasTexture(makeGroundTexture(random));
    groundTex.anisotropy = software ? 1 : 4;
    groundTex.colorSpace = THREE.SRGBColorSpace;
    groundTexRef = groundTex;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.half * 2, CITY.half * 2),
      new THREE.MeshLambertMaterial({ map: groundTex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    cityGroup.add(ground);
    // The sea, a touch above the sand so it shimmers over it.
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY.half * 2, CITY.half - CITY.waterZ + 8),
      new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.92 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.12, (CITY.waterZ + CITY.half) / 2 - 4);
    cityGroup.add(sea);

    // Buildings, one mesh each so the facade texture can tile by height.
    const facadeTex = new THREE.CanvasTexture(makeFacadeTexture(random));
    facadeTex.wrapS = THREE.RepeatWrapping;
    facadeTex.wrapT = THREE.RepeatWrapping;
    facadeTex.colorSpace = THREE.SRGBColorSpace;
    const roofParts = [];
    for (const b of city.buildings) {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i += 1) {
        uv.setXY(i, uv.getX(i) * (b.w / 11), uv.getY(i) * (b.h / 11));
      }
      geo.translate(b.x, b.h / 2, b.z);
      const mat = new THREE.MeshLambertMaterial({ map: facadeTex, color: b.color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      cityGroup.add(mesh);
      buildingMeshes.push(mesh);
      roofParts.push(box(b.w + 0.6, 0.5, b.d + 0.6, b.x, b.h + 0.25, b.z, b.roof));
    }
    const roofs = new THREE.Mesh(mergeBoxes(roofParts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    roofs.castShadow = true;
    cityGroup.add(roofs);

    // Palms, merged into one mesh.
    const palmParts = [];
    for (const p of city.palms) {
      palmParts.push(box(0.28, 4.2, 0.28, p.x, 2.1, p.z, PALETTE.palmTrunk));
      palmParts.push(box(2.6, 0.5, 2.6, p.x, 4.5, p.z, PALETTE.palmLeaf));
      palmParts.push(box(1.8, 0.4, 0.5, p.x, 4.9, p.z, PALETTE.palmLeaf, 0.6));
      palmParts.push(box(0.5, 0.4, 1.8, p.x, 4.9, p.z, PALETTE.palmLeaf, -0.6));
    }
    const palms = new THREE.Mesh(mergeBoxes(palmParts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    palms.castShadow = true;
    cityGroup.add(palms);

    // Street lamps, merged into one mesh (pole + glowing head).
    const lampParts = [];
    for (const l of city.lamps) {
      lampParts.push(box(0.18, 5.4, 0.18, l.x, 2.7, l.z, 0x2a2a30));
      lampParts.push(box(0.9, 0.18, 0.18, l.x, 5.4, l.z, PALETTE.lampGlow));
      lampParts.push(box(0.3, 0.3, 0.3, l.x + 0.4, 5.3, l.z, 0xfff2c0));
    }
    const lamps = new THREE.Mesh(mergeBoxes(lampParts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    cityGroup.add(lamps);

    // Mission beacon: a light pillar and a floating diamond, moved per frame.
    beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 42, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: PALETTE.beacon, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    beacon.visible = false;
    cityGroup.add(beacon);
    beaconDiamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: PALETTE.beacon }),
    );
    beaconDiamond.visible = false;
    cityGroup.add(beaconDiamond);

    scene.add(cityGroup);
  }

  // --- cars ----------------------------------------------------------------
  function makeCarMesh(car) {
    const group = new THREE.Group();
    const bodyColor = car.kind === 'cop' ? 0x14161f : car.color;
    const parts = [
      box(2.0, 0.62, 4.4, 0, 0.62, 0, bodyColor), // body
      box(1.7, 0.55, 2.2, 0, 1.18, -0.25, 0x1c2733), // cabin glass
      box(1.74, 0.16, 2.0, 0, 1.0, -0.25, bodyColor), // cabin base
      box(0.42, 0.72, 0.72, -0.82, 0.36, 1.45, 0x141414), // wheels
      box(0.42, 0.72, 0.72, 0.82, 0.36, 1.45, 0x141414),
      box(0.42, 0.72, 0.72, -0.82, 0.36, -1.45, 0x141414),
      box(0.42, 0.72, 0.72, 0.82, 0.36, -1.45, 0x141414),
      box(0.34, 0.2, 0.08, -0.6, 0.66, 2.21, 0xfff2b0), // headlights
      box(0.34, 0.2, 0.08, 0.6, 0.66, 2.21, 0xfff2b0),
      box(0.34, 0.18, 0.08, -0.6, 0.66, -2.21, 0xcc2222), // taillights
      box(0.34, 0.18, 0.08, 0.6, 0.66, -2.21, 0xcc2222),
    ];
    const mesh = new THREE.Mesh(mergeBoxes(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    group.add(mesh);
    let lightBar = null;
    if (car.kind === 'cop') {
      const barGeo = mergeBoxes([
        box(0.7, 0.22, 0.5, -0.42, 1.56, -0.25, 0xdd2222),
        box(0.7, 0.22, 0.5, 0.42, 1.56, -0.25, 0x2244ff),
      ]);
      lightBar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true }));
      group.add(lightBar);
    }
    scene.add(group);
    return { group, lightBar };
  }

  function syncCars(state) {
    const seen = new Set();
    for (const car of state.cars) {
      seen.add(car.id);
      let entry = carMeshes.get(car.id);
      if (!entry) {
        entry = makeCarMesh(car);
        carMeshes.set(car.id, entry);
      }
      entry.group.position.set(car.x, 0, car.z);
      entry.group.rotation.y = car.yaw;
      if (entry.lightBar) {
        entry.lightBar.material.opacity = 0.55 + 0.45 * Math.sin(car.sirenPhase * 2);
      }
    }
    for (const [id, entry] of carMeshes) {
      if (!seen.has(id)) {
        scene.remove(entry.group);
        carMeshes.delete(id);
      }
    }
  }

  // --- people ---------------------------------------------------------------
  function syncPerson(key, obj, bodyColor, skinColor, pantsColor, down) {
    let entry = personMeshes.get(key);
    if (!entry) {
      entry = makePerson(bodyColor, skinColor, pantsColor);
      scene.add(entry.group);
      personMeshes.set(key, entry);
    }
    entry.group.position.set(obj.x, 0, obj.z);
    if (down) {
      entry.group.rotation.set(-Math.PI / 2, obj.yaw, 0);
      entry.legL.rotation.x = 0;
      entry.legR.rotation.x = 0;
    } else {
      entry.group.rotation.set(0, obj.yaw, 0);
      const swing = Math.sin(obj.walkPhase) * 0.55;
      entry.legL.rotation.x = swing;
      entry.legR.rotation.x = -swing;
    }
    return entry;
  }

  function syncPeople(state) {
    const seen = new Set();
    // Player.
    const p = state.player;
    if (!playerMeshes) {
      playerMeshes = makePerson(0x2e6ec2, 0xd8a075, 0x2a2a33);
      // The player's right arm swings for the punch: rebuild it as its own mesh.
      scene.add(playerMeshes.group);
    }
    playerMeshes.group.visible = p.onFoot;
    if (p.onFoot) {
      playerMeshes.group.position.set(p.x, 0, p.z);
      playerMeshes.group.rotation.set(0, p.yaw, 0);
      const swing = p.moving ? Math.sin(p.walkPhase) * 0.6 : 0;
      playerMeshes.legL.rotation.x = swing;
      playerMeshes.legR.rotation.x = -swing;
      // Punch: right arm (index 3 of the torso geometry is merged; fake it by
      // tilting the whole torso slightly forward during the swing).
      playerMeshes.torso.rotation.x = p.punchAnim > 0 ? -0.35 : 0;
    }
    for (const ped of state.peds) {
      seen.add(ped);
      syncPerson(ped, ped, ped.color, 0xd8a075, 0x3a3a44, ped.mode === 'down');
    }
    for (const off of state.officers) {
      seen.add(off);
      syncPerson(off, off, 0x1a2a55, 0xc89868, 0x1a1a22, off.downTimer > 0);
    }
    for (const [key, entry] of personMeshes) {
      if (!seen.has(key)) {
        scene.remove(entry.group);
        personMeshes.delete(key);
      }
    }
  }

  // --- camera ---------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  let camYaw = Math.PI;
  let camPitch = 0.34;
  let camDist = 10;
  let freeCamera = null; // { pos: [x,y,z], target: [x,y,z] } for shots
  let lastOrbitAt = -999;
  let titleAngle = 0;

  function orbit(dx, dy, now) {
    camYaw -= dx * 0.0042;
    camPitch = Math.max(0.08, Math.min(1.1, camPitch + dy * 0.003));
    lastOrbitAt = now;
  }
  function zoom(delta) {
    camDist = Math.max(6, Math.min(17, camDist + delta * 0.01));
  }

  function updateCamera(state, screen, dt, now) {
    if (freeCamera) {
      let cx = freeCamera.pos[0];
      let cy = freeCamera.pos[1];
      let cz = freeCamera.pos[2];
      // Keep a staged camera out of buildings, like the follow camera.
      const buildings = state.city.buildings;
      for (let i = 0; i < buildings.length; i += 1) {
        const b = buildings[i];
        if (cx > b.x - b.hw - 0.5 && cx < b.x + b.hw + 0.5 && cz > b.z - b.hd - 0.5 && cz < b.z + b.hd + 0.5 && cy < b.h + 1) {
          cy = b.h + 1.5;
        }
      }
      camera.position.set(cx, cy, cz);
      camera.lookAt(freeCamera.target[0], freeCamera.target[1], freeCamera.target[2]);
      return;
    }
    const p = state.player;
    if (screen === 'title') {
      titleAngle += dt * 0.05;
      const r = 150;
      camera.position.set(Math.sin(titleAngle) * r, 55, Math.cos(titleAngle) * r);
      camera.lookAt(0, 8, 60);
      return;
    }
    const driving = !p.onFoot && p.car;
    if (driving && now - lastOrbitAt > 2.5) {
      // Ease the camera behind the car when the player is not steering it.
      let diff = p.yaw - camYaw;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      camYaw += diff * Math.min(1, 1.6 * dt);
    }
    const targetDist = driving ? 12 : 9.5;
    camDist += (targetDist - camDist) * Math.min(1, 2 * dt);
    const lookX = p.x;
    const lookZ = p.z;
    const lookY = 1.6;
    const backX = Math.sin(camYaw);
    const backZ = Math.cos(camYaw);
    const flat = Math.cos(camPitch) * camDist;
    const height = Math.sin(camPitch) * camDist;
    let cx = lookX - backX * flat;
    let cy = lookY + height;
    let cz = lookZ - backZ * flat;
    // Keep the camera out of buildings.
    const buildings = state.city.buildings;
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (cx > b.x - b.hw - 0.5 && cx < b.x + b.hw + 0.5 && cz > b.z - b.hd - 0.5 && cz < b.z + b.hd + 0.5 && cy < b.h + 1) {
        cy = b.h + 1.5;
      }
    }
    cx = Math.max(-CITY.half, Math.min(CITY.half, cx));
    cz = Math.max(-CITY.half, Math.min(CITY.half, cz));
    cy = Math.max(1.4, cy);
    if (state.impact > 0) {
      // Deterministic shake (a function of elapsed time, not Math.random) so
      // screenshot staging stays repeatable.
      const s = state.impact * 0.5;
      const t = state.elapsed * 47;
      cx += Math.sin(t * 1.3) * s;
      cy += Math.sin(t * 1.7 + 1.3) * s;
      cz += Math.sin(t * 1.1 + 2.1) * s;
    }
    camera.position.set(cx, cy, cz);
    camera.lookAt(lookX + backX * 4, lookY, lookZ + backZ * 4);
    // The sun shadow follows the player.
    sun.position.set(p.x - 120, 90, p.z + 180);
    sun.target.position.set(p.x, 0, p.z);
  }

  // --- HUD ------------------------------------------------------------------
  const minimap = hud.minimap;
  const mctx = minimap.getContext('2d');
  const cache = { money: null, wanted: null, health: null, objective: null, speed: null, timer: null, dialog: null, mission: null };

  function setText(el, value, key) {
    if (cache[key] !== value) {
      cache[key] = value;
      el.textContent = value;
    }
  }

  function drawMinimap(state) {
    const S = 180;
    const scale = S / (CITY.half * 2);
    const px = (v) => (v + CITY.half) * scale;
    mctx.clearRect(0, 0, S, S);
    mctx.fillStyle = '#101018';
    mctx.fillRect(0, 0, S, S);
    // Sea and sand.
    mctx.fillStyle = '#14486b';
    mctx.fillRect(0, px(CITY.waterZ), S, S - px(CITY.waterZ));
    mctx.fillStyle = '#c9a06a';
    mctx.fillRect(0, px(CITY.beachZ), S, px(CITY.waterZ) - px(CITY.beachZ));
    // Roads.
    mctx.strokeStyle = '#3d3d48';
    mctx.lineWidth = 4;
    for (let v = -180; v <= 180; v += 60) {
      mctx.beginPath();
      mctx.moveTo(px(v), 0);
      mctx.lineTo(px(v), px(CITY.beachZ));
      mctx.stroke();
      mctx.beginPath();
      mctx.moveTo(0, px(v));
      mctx.lineTo(S, px(v));
      mctx.stroke();
    }
    // Mission marker.
    if (state.marker) {
      const pulse = 1 + 0.25 * Math.sin(state.elapsed * 5);
      mctx.fillStyle = '#ffd23c';
      mctx.save();
      mctx.translate(px(state.marker.x), px(state.marker.z));
      mctx.rotate(Math.PI / 4);
      const r = 5 * pulse;
      mctx.fillRect(-r, -r, r * 2, r * 2);
      mctx.restore();
    }
    // Cars.
    for (const car of state.cars) {
      mctx.fillStyle = car.kind === 'cop' ? (Math.floor(state.elapsed * 4) % 2 === 0 ? '#3355ff' : '#ff3333') : '#e8e8e8';
      mctx.fillRect(px(car.x) - 2, px(car.z) - 2, 4, 4);
    }
    // Officers.
    mctx.fillStyle = '#3355ff';
    for (const off of state.officers) mctx.fillRect(px(off.x) - 2, px(off.z) - 2, 4, 4);
    // Player arrow.
    const p = state.player;
    mctx.save();
    mctx.translate(px(p.x), px(p.z));
    mctx.rotate(p.yaw);
    mctx.fillStyle = '#4fc3f7';
    mctx.beginPath();
    mctx.moveTo(0, -7);
    mctx.lineTo(5, 5);
    mctx.lineTo(-5, 5);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  function updateHud(state, screen) {
    const p = state.player;
    setText(hud.money, `$${state.money}`, 'money');
    const stars = '★'.repeat(state.wanted) + '☆'.repeat(Math.max(0, 5 - state.wanted));
    setText(hud.wanted, state.wanted > 0 ? `WANTED ${stars}` : stars, 'wanted');
    hud.wanted.style.color = state.wanted > 0 ? '#ff5252' : '#8b93a3';
    hud.wanted.style.opacity = state.wanted > 0 && Math.floor(state.elapsed * 2) % 2 === 0 ? '0.55' : '1';
    const healthPct = Math.max(0, Math.round((state.health / 100) * 100));
    if (cache.health !== healthPct) {
      cache.health = healthPct;
      hud.healthFill.style.width = `${healthPct}%`;
      hud.healthFill.style.background = healthPct > 50 ? '#4caf50' : healthPct > 25 ? '#ff9800' : '#f44336';
    }
    const mission = MISSIONS[state.missionIndex];
    setText(hud.missionName, mission ? mission.name : 'FREE ROAM', 'mission');
    setText(hud.objective, state.objective, 'objective');
    const kmh = state.player.onFoot ? 0 : Math.round(Math.abs(p.car ? p.car.speed : 0) * 3.6);
    setText(hud.speed, p.onFoot ? '' : `${kmh} km/h`, 'speed');
    const timerText = state.missionTimer > 0 ? `⏱ ${Math.ceil(state.missionTimer)}s` : '';
    setText(hud.timer, timerText, 'timer');
    hud.timer.style.color = state.missionTimer > 0 && state.missionTimer < 15 ? '#ff5252' : '#ffd23c';
    if (state.dialog) {
      const line = state.dialog.lines[state.dialog.index];
      const key = `${state.dialog.speaker}:${state.dialog.index}:${line}`;
      if (cache.dialog !== key) {
        cache.dialog = key;
        hud.dialogSpeaker.textContent = state.dialog.speaker;
        hud.dialogText.textContent = line;
        hud.dialogBox.style.display = 'block';
      }
    } else if (cache.dialog !== null) {
      cache.dialog = null;
      hud.dialogBox.style.display = 'none';
    }
    hud.hud.style.display = screen === 'play' ? 'block' : 'none';
    drawMinimap(state);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // Adaptive quality: software rendering (SwiftShader) cannot hold the full
  // scene at 60 fps, so the renderer steps down — shadows off, then a lower
  // pixel ratio — when the measured frame rate stays low. Real GPUs never
  // trigger this, and screenshot staging (two painted frames) never does.
  // Software GL starts at level 1 (shadows already off, low pixel ratio).
  let quality = software ? 1 : 0;
  let qFrames = 0;
  let qTime = 0;
  let qLast = 0;
  function applyQuality() {
    if (quality === 1) {
      sun.castShadow = false;
      renderer.setPixelRatio(software ? 0.66 : 1);
      if (groundTexRef) {
        groundTexRef.anisotropy = 1;
        groundTexRef.needsUpdate = true;
      }
      resize();
    } else if (quality === 2) {
      renderer.setPixelRatio(software ? 0.5 : 0.66);
      resize();
    }
  }
  function autoQuality(nowSeconds) {
    if (qLast === 0) {
      qLast = nowSeconds;
      return;
    }
    qTime += nowSeconds - qLast;
    qLast = nowSeconds;
    qFrames += 1;
    if (qFrames >= 45) {
      const fps = qFrames / Math.max(0.001, qTime);
      qFrames = 0;
      qTime = 0;
      if (fps < 18 && quality < 2) {
        quality += 1;
        applyQuality();
      }
    }
  }

  return {
    buildStatic,
    orbit,
    zoom,
    get camYaw() {
      return camYaw;
    },
    get quality() {
      return quality;
    },
    setCamYaw(v) {
      camYaw = v;
    },
    setFreeCamera(pos, target) {
      freeCamera = { pos, target };
    },
    clearFreeCamera() {
      freeCamera = null;
    },
    draw(state, screen, dt, now) {
      autoQuality(now);
      syncCars(state);
      syncPeople(state);
      if (state.marker) {
        beacon.visible = true;
        beaconDiamond.visible = true;
        beacon.position.set(state.marker.x, 21, state.marker.z);
        beaconDiamond.position.set(state.marker.x, 7 + Math.sin(state.elapsed * 2.5) * 0.8, state.marker.z);
        beaconDiamond.rotation.y = state.elapsed * 1.5;
      } else {
        beacon.visible = false;
        beaconDiamond.visible = false;
      }
      updateCamera(state, screen, dt, now);
      updateHud(state, screen);
      renderer.render(scene, camera);
    },
  };
}

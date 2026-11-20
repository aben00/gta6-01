// Sunset Heat — the renderer.
//
// Three.js draws the city (built once by city.js), the cars,
// pedestrians, player, stash diamonds and the objective beacon, and the
// DOM paints the HUD and the minimap on top. The camera is a chase camera
// that orbits with the mouse and eases behind the car while driving.
// Auto-quality watches the real frame time and steps the pixel ratio down
// when the machine struggles, so software rendering stays playable.

import * as THREE from 'three';
import { COLORS, DRIVING, ISLAND, JOBS, QUALITY_RUNGS, QUALITY_WINDOW, STREETS } from './config.js';
import { buildCity } from './city.js';

/** Screen names the loop and the screenshots share. */
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';

/**
 * A box soup: parts go in one at a time, and `build()` folds them into a
 * single vertex-coloured geometry. Every part is
 * {w, h, d, x, y, z, ry, color}; the colour lands on every vertex of the
 * box, so one mesh can wear many colours without a material per part.
 */
class BoxBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.base = 0;
    this.tint = new THREE.Color();
  }

  add(part) {
    const geo = new THREE.BoxGeometry(part.w, part.h, part.d);
    const matrix = new THREE.Matrix4().makeRotationY(part.ry || 0);
    matrix.setPosition(part.x, part.y, part.z);
    geo.applyMatrix4(matrix);
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    this.tint.setHex(part.color);
    for (let v = 0; v < p.count; v += 1) {
      this.pos.push(p.getX(v), p.getY(v), p.getZ(v));
      this.nor.push(n.getX(v), n.getY(v), n.getZ(v));
      this.col.push(this.tint.r, this.tint.g, this.tint.b);
    }
    const index = geo.index;
    for (let i = 0; i < index.count; i += 1) this.idx.push(index.getX(i) + this.base);
    this.base += p.count;
    geo.dispose();
    return this;
  }

  build() {
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    merged.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    merged.setIndex(this.idx);
    return merged;
  }
}

/** Shorthand for one coloured box in a builder. */
function box(builder, w, h, d, x, y, z, color) {
  builder.add({ w, h, d, x, y, z, color });
  return builder;
}

/** A person: legs, torso, arms and head, in a shirt colour. */
function personGeometry(shirt) {
  const skin = 0xd9a077;
  const pants = 0x23232e;
  const b = new BoxBuilder();
  box(b, 0.34, 0.8, 0.34, -0.2, 0.4, 0, pants);
  box(b, 0.34, 0.8, 0.34, 0.2, 0.4, 0, pants);
  box(b, 0.85, 0.68, 0.45, 0, 1.14, 0, shirt);
  box(b, 0.22, 0.62, 0.22, -0.55, 1.12, 0, shirt);
  box(b, 0.22, 0.62, 0.22, 0.55, 1.12, 0, shirt);
  box(b, 0.42, 0.4, 0.4, 0, 1.68, 0, skin);
  return b.build();
}

/** A car: body, cabin, four wheels, headlights and taillights. */
function carGeometry(color) {
  const dark = 0x15151a;
  const b = new BoxBuilder();
  box(b, 1.9, 0.75, 4.3, 0, 0.62, 0, color);
  box(b, 1.7, 0.62, 2.2, 0, 1.28, -0.25, 0x1b1e26);
  for (const sx of [-0.95, 0.95]) {
    for (const sz of [1.45, -1.45]) box(b, 0.35, 0.7, 0.72, sx, 0.35, sz, dark);
  }
  box(b, 0.34, 0.2, 0.1, -0.55, 0.72, 2.16, 0xffe9a8);
  box(b, 0.34, 0.2, 0.1, 0.55, 0.72, 2.16, 0xffe9a8);
  box(b, 0.34, 0.2, 0.1, -0.55, 0.72, -2.16, 0xc22a2a);
  box(b, 0.34, 0.2, 0.1, 0.55, 0.72, -2.16, 0xc22a2a);
  return b.build();
}

/** The sunset band on the northern horizon: a painted gradient plane. */
function makeSkyBand() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  const stops = [[0, '#241543'], [0.45, '#5a2a63'], [0.75, '#b85a3c'], [1, '#ff9a5c']];
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(canvas);
  const band = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 460),
    new THREE.MeshBasicMaterial({ map: tex, fog: false }),
  );
  band.rotation.y = Math.PI;
  band.position.set(0, 150, 560);
  return band;
}

/**
 * The lights: sky bounce, the low sun, and a warm fill from the south.
 * Lifted for the round-3 dossier reframe so subjects read at
 * contact-sheet size: hemisphere 1.3, south fill 1.15.
 */
function addLights(scene) {
  scene.add(new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 1.3));
  const sunLight = new THREE.DirectionalLight(COLORS.sunLight, 1.25);
  sunLight.position.set(150, 200, 300);
  scene.add(sunLight);
  // A warm fill from the south, so the faces turned toward the camera
  // (car rears, the player's back) never go black at dusk.
  const fillLight = new THREE.DirectionalLight(0xffe0c0, 1.15);
  fillLight.position.set(-60, 140, -260);
  scene.add(fillLight);
}

/** The low sun, its haze, and the gradient band over the sea. */
function addSky(scene) {
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(55, 32),
    new THREE.MeshBasicMaterial({ color: COLORS.sun, fog: false }),
  );
  sunDisc.position.set(30, 160, 520);
  scene.add(sunDisc);
  const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(120, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc98a, fog: false, transparent: true, opacity: 0.22 }),
  );
  sunGlow.position.set(30, 160, 515);
  scene.add(sunGlow);
  scene.add(makeSkyBand());
}

/**
 * Keep a pool of three.js groups in step with a list of game objects:
 * create a group for each newcomer, update every live one, drop the
 * groups whose object left the list. `keyOf` picks the pool key.
 */
function syncGroupPool(pool, scene, items, keyOf, create, update) {
  const seen = new Set();
  for (const item of items) {
    const key = keyOf(item);
    seen.add(key);
    let group = pool.get(key);
    if (!group) {
      group = create(item);
      pool.set(key, group);
      scene.add(group);
    }
    update(group, item);
  }
  for (const [key, group] of pool) {
    if (!seen.has(key)) {
      scene.remove(group);
      pool.delete(key);
    }
  }
}

/** Exhaust smoke: one Points cloud, a pool of puffs that rise and fade. */
class SmokeTrail {
  constructor(scene) {
    this.pool = 24;
    this.positions = new Float32Array(this.pool * 3);
    this.life = new Float32Array(this.pool);
    for (let i = 0; i < this.pool; i += 1) this.positions[i * 3 + 1] = -100;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      color: 0x8a8a92, size: 2.6, transparent: true, opacity: 0.4, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
    this.timer = 0;
  }

  update(state, dt) {
    const car = state.player.car;
    const smoking = !state.player.onFoot && car && car.dmg > DRIVING.smokeFrom && Math.abs(car.speed) > 2;
    this.timer -= dt;
    if (smoking && this.timer <= 0) {
      this.timer = 0.12;
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.pool;
      this.positions[i * 3] = car.x - Math.sin(car.yaw) * 2.2;
      this.positions[i * 3 + 1] = 0.9;
      this.positions[i * 3 + 2] = car.z - Math.cos(car.yaw) * 2.2;
      this.life[i] = 1;
    }
    for (let i = 0; i < this.pool; i += 1) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt * 0.9;
      this.positions[i * 3 + 1] += dt * 1.6;
      if (this.life[i] <= 0) this.positions[i * 3 + 1] = -100;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

/** Watches real frame time and steps the pixel ratio down when it sags. */
class QualityGovernor {
  constructor(apply) {
    this.apply = apply;
    this.level = 1;
    this.ema = 16;
    this.frames = 0;
    this.cooldown = 0;
    this.lastWall = 0;
  }

  observe() {
    const now = performance.now();
    if (this.lastWall > 0) {
      const gap = now - this.lastWall;
      if (gap > 0 && gap < 1000) {
        this.ema = this.ema * 0.95 + gap * 0.05;
        this.frames += 1;
        this.cooldown -= 1;
        if (this.frames >= QUALITY_WINDOW && this.cooldown <= 0) {
          this.frames = 0;
          this.cooldown = QUALITY_WINDOW;
          const fps = 1000 / Math.max(1, this.ema);
          if (fps < 30 && this.level > 0) {
            this.level -= 1;
            this.apply(this.level);
          } else if (fps > 50 && this.level < QUALITY_RUNGS.length - 1) {
            this.level += 1;
            this.apply(this.level);
          }
        }
      }
    }
    this.lastWall = now;
  }
}

/** The DOM half: HUD text, bars, screens, and the 2D minimap. */
class Hud {
  constructor() {
    const el = (id) => document.getElementById(id);
    this.nodes = {
      root: el('hud'),
      money: el('money'),
      stars: el('stars'),
      healthFill: el('health-fill'),
      carRow: el('car-row'),
      carFill: el('car-fill'),
      missionNum: el('mission-num'),
      missionObjective: el('mission-objective'),
      missionText: el('mission-text'),
      missionTimer: el('mission-timer'),
      stashCount: el('stash-count'),
      prompt: el('prompt'),
      dialogue: el('dialogue'),
      dialogueText: el('dialogue-text'),
      banner: el('banner'),
      speed: el('speed'),
      title: el('screen-title'),
      paused: el('screen-paused'),
      busted: el('screen-busted'),
      minimap: el('minimap'),
    };
    this.cache = {};
    this.minimapTick = 0;
  }

  setText(node, key, value) {
    if (!node || this.cache[key] === value) return;
    this.cache[key] = value;
    node.textContent = value;
  }

  setShown(node, key, show) {
    if (!node || this.cache[key] === show) return;
    this.cache[key] = show;
    node.style.display = show ? '' : 'none';
  }

  setBarWidth(node, key, width) {
    if (!node || this.cache[key] === width) return;
    this.cache[key] = width;
    node.style.width = width;
  }

  /** The card for the current job, or the story-complete card. */
  missionCard(state) {
    if (state.storyDone) {
      return { num: '★', name: 'Story complete', objective: 'Solmarina is yours — free roam', timer: '' };
    }
    const job = JOBS[state.missionIndex] || JOBS[0];
    return {
      num: `${state.missionIndex + 1}`,
      name: job.name,
      objective: job.stages[state.missionStage] || job.stages[0],
      timer: state.missionIndex === 1 ? `⏱ ${Math.max(0, Math.ceil(state.missionTimer))}s` : '',
    };
  }

  paint(state, screen) {
    const n = this.nodes;
    this.setShown(n.root, 'hud', screen !== SCREEN_TITLE);
    this.setShown(n.title, 'title', screen === SCREEN_TITLE);
    this.setShown(n.paused, 'paused', screen === SCREEN_PAUSED);
    this.setShown(n.busted, 'busted', screen === SCREEN_BUSTED);
    if (screen === SCREEN_TITLE) return;
    this.setText(n.money, 'money', `$${state.money}`);
    this.setText(n.stars, 'stars', '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted));
    if (n.stars) n.stars.style.color = state.wanted > 0 ? '#ff6b6b' : '#8b93a3';
    this.setBarWidth(n.healthFill, 'healthWidth', `${Math.max(0, state.health)}%`);
    const car = state.player.car;
    this.setShown(n.carRow, 'carRow', !state.player.onFoot && !!car);
    if (car) this.setBarWidth(n.carFill, 'carWidth', `${Math.max(0, (1 - car.dmg) * 100)}%`);
    const card = this.missionCard(state);
    this.setText(n.missionNum, 'missionNum', card.num);
    this.setText(n.missionObjective, 'missionObjective', `${card.num} · ${card.name}`);
    this.setText(n.missionText, 'missionText', card.objective);
    this.setText(n.missionTimer, 'missionTimer', card.timer);
    this.setShown(n.missionTimer, 'missionTimerShown', card.timer !== '');
    this.setText(n.stashCount, 'stashCount', `STASHES ${state.stashesFound}/8`);
    this.setText(n.prompt, 'prompt', state.prompt);
    this.setShown(n.prompt, 'promptShown', state.prompt !== '');
    const showDialogue = state.missionIndex === 0 && !!state.dialogue;
    this.setShown(n.dialogue, 'dialogue', showDialogue);
    if (showDialogue) this.setText(n.dialogueText, 'dialogueText', state.dialogue);
    this.setText(n.banner, 'banner', state.banner);
    this.setShown(n.banner, 'bannerShown', state.banner !== '');
    const kmh = car ? Math.round(Math.abs(car.speed) * 3.6) : 0;
    this.setText(n.speed, 'speed', !state.player.onFoot && car ? `${kmh} km/h` : '');
    // The minimap is a 2D repaint: every fifth draw is plenty.
    this.minimapTick += 1;
    if (this.minimapTick % 5 === 1) this.paintMinimap(state);
  }

  /** Streets, sand and sea, then the markers and the moving dots. */
  paintMinimap(state) {
    const map = this.nodes.minimap;
    if (!map) return;
    const ctx = map.getContext('2d');
    const S = map.width;
    const toX = (x) => ((x - ISLAND.west) / (ISLAND.east - ISLAND.west)) * S;
    const toY = (z) => ((z - ISLAND.south) / (ISLAND.north - ISLAND.south)) * S;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10, 10, 18, 0.88)';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.lineWidth = 1;
    for (let x = -240; x <= 240; x += STREETS.every) {
      ctx.beginPath();
      ctx.moveTo(toX(x), 0);
      ctx.lineTo(toX(x), S);
      ctx.stroke();
    }
    for (let z = -240; z <= 240; z += STREETS.every) {
      ctx.beginPath();
      ctx.moveTo(0, toY(z));
      ctx.lineTo(S, toY(z));
      ctx.stroke();
    }
    ctx.fillStyle = '#c9a06a';
    ctx.fillRect(0, toY(ISLAND.sandAt), S, S - toY(ISLAND.sandAt));
    ctx.fillStyle = '#16324a';
    ctx.fillRect(0, toY(ISLAND.waterAt), S, S - toY(ISLAND.waterAt));
    // Safehouse: green square, and N for north at the sea edge.
    ctx.fillStyle = '#2fae5f';
    ctx.fillRect(toX(-30) - 4, toY(-150) - 4, 8, 8);
    ctx.fillStyle = '#e8e8f0';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', S - 14, S - 6);
    const diamond = (x, y, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
    };
    for (const stash of state.stashes) {
      if (stash.found) continue;
      diamond(toX(stash.x), toY(stash.z), 4, '#ffc93c');
    }
    if (state.objective && !state.storyDone) {
      diamond(toX(state.objective.x), toY(state.objective.z), 6, '#ffd75e');
    }
    for (const ped of state.peds) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(toX(ped.x) - 1, toY(ped.z) - 1, 2, 2);
    }
    for (const car of state.cars) {
      ctx.fillStyle = car.kind === 'cop' ? '#ff4444' : 'rgba(255, 255, 255, 0.6)';
      ctx.fillRect(toX(car.x) - 1.5, toY(car.z) - 1.5, 3, 3);
    }
    const px = toX(state.player.x);
    const py = toY(state.player.z);
    const yaw = state.player.yaw;
    ctx.fillStyle = '#3fa7ff';
    ctx.beginPath();
    ctx.moveTo(px + Math.sin(yaw) * 7, py + Math.cos(yaw) * 7);
    ctx.lineTo(px + Math.sin(yaw + 2.5) * 5, py + Math.cos(yaw + 2.5) * 5);
    ctx.lineTo(px + Math.sin(yaw - 2.5) * 5, py + Math.cos(yaw - 2.5) * 5);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Build the renderer: the three.js scene, the HUD handles and the camera.
 * `layout` is the city's rolled layout; `random` paints the facades.
 */
export function createRenderer(canvas, layout, random) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (THREE.ACESFilmicToneMapping !== undefined) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Round-3 lighting lift: exposure 1.12, up from 1.05.
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 130, 560);
  addLights(scene);
  addSky(scene);
  buildCity(scene, layout, random);

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 1500);
  camera.position.set(0, 150, -180);

  const carMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const personMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const goldMaterial = new THREE.MeshBasicMaterial({ color: COLORS.gold });
  const beaconMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd75e, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
  });

  const carGroups = new Map();
  const pedGroups = new Map();
  const playerGroup = new THREE.Group();
  playerGroup.add(new THREE.Mesh(personGeometry(0x2f6fe0), personMaterial));
  scene.add(playerGroup);

  const stashMeshes = [];
  for (let i = 0; i < 8; i += 1) {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), goldMaterial);
    scene.add(mesh);
    stashMeshes.push(mesh);
  }

  const beacon = new THREE.Group();
  const beaconPole = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 34, 12, 1, true), beaconMaterial);
  beaconPole.position.y = 17;
  const beaconTop = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), goldMaterial);
  beaconTop.position.y = 5;
  beacon.add(beaconPole);
  beacon.add(beaconTop);
  scene.add(beacon);

  const smoke = new SmokeTrail(scene);
  const hud = new Hud();

  const api = {
    camYaw: 0,
    shotCam: null,
    camPos: new THREE.Vector3(0, 150, -180),
    lookAt: new THREE.Vector3(0, 0, 0),
  };
  const governor = new QualityGovernor((level) => {
    const rung = QUALITY_RUNGS[level] || QUALITY_RUNGS[1];
    renderer.setPixelRatio(rung.pixelRatio);
    resize();
  });

  function resize() {
    const width = canvas.clientWidth || 1280;
    const height = canvas.clientHeight || 720;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function applyQuality() {
    const rung = QUALITY_RUNGS[governor.level] || QUALITY_RUNGS[1];
    renderer.setPixelRatio(rung.pixelRatio);
    resize();
  }
  applyQuality();

  /** One car group per live car, with its roof sign or light bar. */
  function makeCarGroup(car) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(carGeometry(car.color), carMaterial);
    body.userData.color = car.color;
    group.add(body);
    if (car.kind === 'cop') {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.28, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }),
      );
      bar.position.y = 1.72;
      bar.name = 'lightbar';
      group.add(bar);
    } else if (car.kind === 'taxi') {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.3, 0.45),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
      );
      sign.position.y = 1.72;
      group.add(sign);
    }
    group.userData.body = body;
    return group;
  }

  function syncCars(state, time) {
    syncGroupPool(carGroups, scene, state.cars, (car) => car.id, makeCarGroup, (group, car) => {
      const body = group.userData.body;
      if (body.userData.color !== car.color) {
        body.geometry.dispose();
        body.geometry = carGeometry(car.color);
        body.userData.color = car.color;
      }
      group.position.set(car.x, 0, car.z);
      group.rotation.y = car.yaw;
      const bar = group.getObjectByName('lightbar');
      if (bar) bar.material.color.setHex(Math.floor(time * 2) % 2 === 0 ? 0xff2222 : 0x2244ff);
    });
  }

  /** Pedestrians and officers share the walker pool. */
  function syncPeds(state) {
    const walkers = [...state.peds, ...state.officers];
    syncGroupPool(pedGroups, scene, walkers, (ped) => ped, (ped) => {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(personGeometry(ped.shirt || 0x3a6fd2), personMaterial));
      return group;
    }, (group, ped) => {
      group.position.set(ped.x, ped.mode === 'down' ? 0.35 : Math.abs(Math.sin(ped.bob || 0)) * 0.06, ped.z);
      group.rotation.y = ped.yaw || 0;
      group.rotation.x = ped.mode === 'down' ? -1.5 : 0;
    });
  }

  function syncPlayer(state) {
    const player = state.player;
    playerGroup.visible = player.onFoot;
    if (!player.onFoot) return;
    playerGroup.position.set(player.x, 0, player.z);
    playerGroup.rotation.y = player.yaw;
  }

  /** The gold diamonds over the stashes not yet found. */
  function syncStashes(state, time) {
    state.stashes.forEach((stash, i) => {
      const mesh = stashMeshes[i];
      if (!mesh) return;
      mesh.visible = !stash.found;
      mesh.position.set(stash.x, 1.3 + Math.sin(time * 2 + i * 1.7) * 0.25, stash.z);
      mesh.rotation.y = time * 1.4 + i;
    });
  }

  /** The light pillar over the current objective. */
  function syncBeacon(state, time) {
    const show = !!state.objective && !state.storyDone;
    beacon.visible = show;
    if (!show) return;
    beacon.position.set(state.objective.x, 0, state.objective.z);
    beacon.children[1].rotation.y = time * 2;
    beacon.children[1].position.y = 5 + Math.sin(time * 2.4) * 0.6;
  }

  /** The slow orbit over the city while the title is up. */
  function titleCamera(time) {
    const angle = time * 0.03;
    camera.position.set(Math.sin(angle) * 230, 150, Math.cos(angle) * 230 - 20);
    camera.lookAt(0, 10, 30);
  }

  /** The chase camera: eased behind the player, looking where they face. */
  function chaseCamera(state, dt) {
    const player = state.player;
    const inCar = !player.onFoot;
    const dist = inCar ? 10.5 : 7;
    const height = inCar ? 4.4 : 3.1;
    const fx = Math.sin(api.camYaw);
    const fz = Math.cos(api.camYaw);
    const wanted = new THREE.Vector3(player.x - fx * dist, height, player.z - fz * dist);
    const k = 1 - Math.exp(-7 * Math.max(dt, 1 / 240));
    api.camPos.lerp(wanted, k);
    api.lookAt.set(player.x + fx * 3, 1.6, player.z + fz * 3);
    camera.position.copy(api.camPos);
    camera.lookAt(api.lookAt);
  }

  /** Chase camera, title orbit, or a fixed shot framing. */
  function updateCamera(state, screen, dt, time) {
    if (api.shotCam) {
      camera.position.set(api.shotCam.pos[0], api.shotCam.pos[1], api.shotCam.pos[2]);
      camera.lookAt(api.shotCam.look[0], api.shotCam.look[1], api.shotCam.look[2]);
      return;
    }
    if (screen === SCREEN_TITLE) {
      titleCamera(time);
      return;
    }
    chaseCamera(state, dt);
  }

  /** One frame: sync the scene to the state, move the camera, paint. */
  function draw(state, screen, dt, time) {
    governor.observe();
    const step = dt || 1 / 60;
    const t = time || 0;
    syncCars(state, t);
    syncPeds(state);
    syncPlayer(state);
    syncStashes(state, t);
    syncBeacon(state, t);
    smoke.update(state, step);
    updateCamera(state, screen, step, t);
    renderer.render(scene, camera);
    hud.paint(state, screen);
  }

  return {
    get camYaw() {
      return api.camYaw;
    },
    set camYaw(value) {
      api.camYaw = value;
    },
    get quality() {
      return governor.level;
    },
    set quality(value) {
      governor.level = value;
      applyQuality();
    },
    draw,
    resize,
    setShotCam(pos, look) {
      api.shotCam = { pos, look };
    },
    clearShotCam() {
      api.shotCam = null;
    },
  };
}

// Sunset Heat — the renderer. Three.js draws the city (built once by
// city.js), the cars, pedestrians, player, stash diamonds and the objective
// beacon, and the DOM paints the HUD and the minimap on top. The camera is
// a chase camera that orbits with the mouse and eases behind the car while
// driving. Auto-quality watches the real frame time and steps the pixel
// ratio down when the machine struggles, so software rendering stays
// playable.

import * as THREE from 'three';
import { BEACH_Z, CAR, MISSIONS, PALETTE, QUALITY, QUALITY_WINDOW, SEA_Z, WORLD } from './config.js';
import { buildCity } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';

/** Merge coloured boxes into one geometry (cars, people, props). */
function mergeColoredBoxes(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let base = 0;
  const tint = new THREE.Color();
  for (const part of parts) {
    const geo = new THREE.BoxGeometry(part.w, part.h, part.d);
    const matrix = new THREE.Matrix4().makeRotationY(part.ry || 0);
    matrix.setPosition(part.x, part.y, part.z);
    geo.applyMatrix4(matrix);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    tint.setHex(part.color);
    for (let v = 0; v < pos.count; v += 1) {
      positions.push(pos.getX(v), pos.getY(v), pos.getZ(v));
      normals.push(nor.getX(v), nor.getY(v), nor.getZ(v));
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
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  return merged;
}

function personGeometry(shirt) {
  const skin = 0xd9a077;
  const pants = 0x23232e;
  return mergeColoredBoxes([
    { w: 0.34, h: 0.8, d: 0.34, x: -0.2, y: 0.4, z: 0, color: pants },
    { w: 0.34, h: 0.8, d: 0.34, x: 0.2, y: 0.4, z: 0, color: pants },
    { w: 0.85, h: 0.68, d: 0.45, x: 0, y: 1.14, z: 0, color: shirt },
    { w: 0.22, h: 0.62, d: 0.22, x: -0.55, y: 1.12, z: 0, color: shirt },
    { w: 0.22, h: 0.62, d: 0.22, x: 0.55, y: 1.12, z: 0, color: shirt },
    { w: 0.42, h: 0.4, d: 0.4, x: 0, y: 1.68, z: 0, color: skin },
  ]);
}

function carGeometry(color) {
  const dark = 0x15151a;
  return mergeColoredBoxes([
    { w: 1.9, h: 0.75, d: 4.3, x: 0, y: 0.62, z: 0, color },
    { w: 1.7, h: 0.62, d: 2.2, x: 0, y: 1.28, z: -0.25, color: 0x1b1e26 },
    { w: 0.35, h: 0.7, d: 0.72, x: -0.95, y: 0.35, z: 1.45, color: dark },
    { w: 0.35, h: 0.7, d: 0.72, x: 0.95, y: 0.35, z: 1.45, color: dark },
    { w: 0.35, h: 0.7, d: 0.72, x: -0.95, y: 0.35, z: -1.45, color: dark },
    { w: 0.35, h: 0.7, d: 0.72, x: 0.95, y: 0.35, z: -1.45, color: dark },
    { w: 0.34, h: 0.2, d: 0.1, x: -0.55, y: 0.72, z: 2.16, color: 0xffe9a8 },
    { w: 0.34, h: 0.2, d: 0.1, x: 0.55, y: 0.72, z: 2.16, color: 0xffe9a8 },
    { w: 0.34, h: 0.2, d: 0.1, x: -0.55, y: 0.72, z: -2.16, color: 0xc22a2a },
    { w: 0.34, h: 0.2, d: 0.1, x: 0.55, y: 0.72, z: -2.16, color: 0xc22a2a },
  ]);
}

export function createRenderer(canvas, layout, random) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (THREE.ACESFilmicToneMapping !== undefined) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 130, 560);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.1);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(PALETTE.sunLight, 1.25);
  sunLight.position.set(150, 200, 300);
  scene.add(sunLight);
  // A warm fill from the south, so the faces turned toward the camera
  // (car rears, the player's back) never go black at dusk.
  const fillLight = new THREE.DirectionalLight(0xffe0c0, 0.9);
  fillLight.position.set(-60, 140, -260);
  scene.add(fillLight);

  // The low sun and its haze, hanging over the sea to the north.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(55, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sunDisc.position.set(30, 160, 520);
  scene.add(sunDisc);
  const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(120, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc98a, fog: false, transparent: true, opacity: 0.22 }),
  );
  sunGlow.position.set(30, 160, 515);
  scene.add(sunGlow);

  // The sunset band itself: a gradient backdrop on the northern horizon.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 512;
  skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const gradient = skyCtx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#241543');
  gradient.addColorStop(0.45, '#5a2a63');
  gradient.addColorStop(0.75, '#b85a3c');
  gradient.addColorStop(1, '#ff9a5c');
  skyCtx.fillStyle = gradient;
  skyCtx.fillRect(0, 0, 512, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  const skyBand = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 460),
    new THREE.MeshBasicMaterial({ map: skyTex, fog: false }),
  );
  skyBand.rotation.y = Math.PI;
  skyBand.position.set(0, 150, 560);
  scene.add(skyBand);

  buildCity(scene, layout, random);

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 1500);
  camera.position.set(0, 150, -180);

  const carMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const personMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const goldMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
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

  // Exhaust smoke: one Points cloud, a pool of puffs that rise and fade.
  const SMOKE_POOL = 24;
  const smokePositions = new Float32Array(SMOKE_POOL * 3);
  const smokeLife = new Float32Array(SMOKE_POOL);
  for (let i = 0; i < SMOKE_POOL; i += 1) smokePositions[i * 3 + 1] = -100;
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
  const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({
    color: 0x8a8a92, size: 2.6, transparent: true, opacity: 0.4, sizeAttenuation: true,
  }));
  smoke.frustumCulled = false;
  scene.add(smoke);
  let smokeCursor = 0;
  let smokeTimer = 0;

  const api = {
    camYaw: 0,
    quality: 1,
    shotCam: null,
    _camPos: new THREE.Vector3(0, 150, -180),
    _lookAt: new THREE.Vector3(0, 0, 0),
    _lastDrawWall: 0,
    _frameTimeEma: 16,
    _frameCount: 0,
    _qualityCooldown: 0,
  };

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
    const rung = QUALITY[api.quality] || QUALITY[1];
    renderer.setPixelRatio(rung.pixelRatio);
    resize();
  }
  applyQuality();

  function syncCars(state, time) {
    const seen = new Set();
    for (const car of state.cars) {
      seen.add(car.id);
      let group = carGroups.get(car.id);
      if (!group) {
        group = new THREE.Group();
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
        carGroups.set(car.id, group);
        scene.add(group);
      }
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
    }
    for (const [id, group] of carGroups) {
      if (!seen.has(id)) {
        scene.remove(group);
        carGroups.delete(id);
      }
    }
  }

  function syncPeds(state, time) {
    const seen = new Set();
    const walkers = [...state.peds, ...state.officers];
    for (const ped of walkers) {
      seen.add(ped);
      let group = pedGroups.get(ped);
      if (!group) {
        group = new THREE.Group();
        group.add(new THREE.Mesh(personGeometry(ped.shirt || 0x3a6fd2), personMaterial));
        pedGroups.set(ped, group);
        scene.add(group);
      }
      group.position.set(ped.x, ped.mode === 'down' ? 0.35 : Math.abs(Math.sin(ped.bob || 0)) * 0.06, ped.z);
      group.rotation.y = ped.yaw || 0;
      group.rotation.x = ped.mode === 'down' ? -1.5 : 0;
    }
    for (const [ped, group] of pedGroups) {
      if (!seen.has(ped)) {
        scene.remove(group);
        pedGroups.delete(ped);
      }
    }
  }

  function syncPlayer(state) {
    const player = state.player;
    playerGroup.visible = player.onFoot;
    if (!player.onFoot) return;
    playerGroup.position.set(player.x, 0, player.z);
    playerGroup.rotation.y = player.yaw;
  }

  function syncStashes(state, time) {
    state.stashes.forEach((stash, i) => {
      const mesh = stashMeshes[i];
      if (!mesh) return;
      mesh.visible = !stash.found;
      mesh.position.set(stash.x, 1.3 + Math.sin(time * 2 + i * 1.7) * 0.25, stash.z);
      mesh.rotation.y = time * 1.4 + i;
    });
  }

  function syncBeacon(state, time) {
    const show = !!state.objective && !state.storyDone;
    beacon.visible = show;
    if (!show) return;
    beacon.position.set(state.objective.x, 0, state.objective.z);
    beacon.children[1].rotation.y = time * 2;
    beacon.children[1].position.y = 5 + Math.sin(time * 2.4) * 0.6;
  }

  function syncSmoke(state, dt) {
    const car = state.player.car;
    const smoking = !state.player.onFoot && car && car.dmg > CAR.smokeFrom && Math.abs(car.speed) > 2;
    smokeTimer -= dt;
    if (smoking && smokeTimer <= 0) {
      smokeTimer = 0.12;
      const i = smokeCursor;
      smokeCursor = (smokeCursor + 1) % SMOKE_POOL;
      smokePositions[i * 3] = car.x - Math.sin(car.yaw) * 2.2;
      smokePositions[i * 3 + 1] = 0.9;
      smokePositions[i * 3 + 2] = car.z - Math.cos(car.yaw) * 2.2;
      smokeLife[i] = 1;
    }
    for (let i = 0; i < SMOKE_POOL; i += 1) {
      if (smokeLife[i] <= 0) continue;
      smokeLife[i] -= dt * 0.9;
      smokePositions[i * 3 + 1] += dt * 1.6;
      if (smokeLife[i] <= 0) smokePositions[i * 3 + 1] = -100;
    }
    smokeGeo.attributes.position.needsUpdate = true;
  }

  function updateCamera(state, screen, dt, time) {
    if (api.shotCam) {
      camera.position.set(api.shotCam.pos[0], api.shotCam.pos[1], api.shotCam.pos[2]);
      camera.lookAt(api.shotCam.look[0], api.shotCam.look[1], api.shotCam.look[2]);
      return;
    }
    if (screen === SCREEN_TITLE) {
      const angle = time * 0.03;
      camera.position.set(Math.sin(angle) * 230, 150, Math.cos(angle) * 230 - 20);
      camera.lookAt(0, 10, 30);
      return;
    }
    const player = state.player;
    const inCar = !player.onFoot;
    const dist = inCar ? 10.5 : 7;
    const height = inCar ? 4.4 : 3.1;
    const fx = Math.sin(api.camYaw);
    const fz = Math.cos(api.camYaw);
    const wanted = new THREE.Vector3(player.x - fx * dist, height, player.z - fz * dist);
    const k = 1 - Math.exp(-7 * Math.max(dt, 1 / 240));
    api._camPos.lerp(wanted, k);
    api._lookAt.set(player.x + fx * 3, 1.6, player.z + fz * 3);
    camera.position.copy(api._camPos);
    camera.lookAt(api._lookAt);
  }

  // ---- HUD (DOM) ----
  const el = (id) => document.getElementById(id);
  const hud = {
    root: el('hud'),
    money: el('money'),
    stars: el('stars'),
    healthFill: el('health-fill'),
    carRow: el('car-row'),
    carFill: el('car-fill'),
    missionNum: el('mission-num'),
    missionObjective: el('mission-objective'),
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
  const lastHud = {};
  function setText(node, key, value) {
    if (!node || lastHud[key] === value) return;
    lastHud[key] = value;
    node.textContent = value;
  }
  function setShown(node, key, show) {
    if (!node || lastHud[key] === show) return;
    lastHud[key] = show;
    node.style.display = show ? '' : 'none';
  }

  function drawMinimap(state) {
    const canvas2d = hud.minimap;
    if (!canvas2d) return;
    const ctx = canvas2d.getContext('2d');
    const S = canvas2d.width;
    const toX = (x) => ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * S;
    const toY = (z) => ((z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ)) * S;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10, 10, 18, 0.88)';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    ctx.lineWidth = 1;
    for (let x = -240; x <= 240; x += 60) {
      ctx.beginPath();
      ctx.moveTo(toX(x), 0);
      ctx.lineTo(toX(x), S);
      ctx.stroke();
    }
    for (let z = -240; z <= 240; z += 60) {
      ctx.beginPath();
      ctx.moveTo(0, toY(z));
      ctx.lineTo(S, toY(z));
      ctx.stroke();
    }
    ctx.fillStyle = '#c9a06a';
    ctx.fillRect(0, toY(BEACH_Z), S, S - toY(BEACH_Z));
    ctx.fillStyle = '#16324a';
    ctx.fillRect(0, toY(SEA_Z), S, S - toY(SEA_Z));
    // Safehouse: green square, and N for north at the sea edge.
    ctx.fillStyle = '#2fae5f';
    ctx.fillRect(toX(-30) - 4, toY(-150) - 4, 8, 8);
    ctx.fillStyle = '#e8e8f0';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('N', S - 14, S - 6);
    for (const stash of state.stashes) {
      if (stash.found) continue;
      ctx.fillStyle = '#ffc93c';
      const x = toX(stash.x);
      const y = toY(stash.z);
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x + 4, y);
      ctx.lineTo(x, y + 4);
      ctx.lineTo(x - 4, y);
      ctx.closePath();
      ctx.fill();
    }
    if (state.objective && !state.storyDone) {
      ctx.fillStyle = '#ffd75e';
      const x = toX(state.objective.x);
      const y = toY(state.objective.z);
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fill();
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

  function updateHud(state, screen) {
    setShown(hud.root, 'hud', screen !== SCREEN_TITLE);
    setShown(hud.title, 'title', screen === SCREEN_TITLE);
    setShown(hud.paused, 'paused', screen === SCREEN_PAUSED);
    setShown(hud.busted, 'busted', screen === SCREEN_BUSTED);
    if (screen === SCREEN_TITLE) return;
    setText(hud.money, 'money', `$${state.money}`);
    setText(hud.stars, 'stars', '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted));
    if (hud.stars) hud.stars.style.color = state.wanted > 0 ? '#ff6b6b' : '#8b93a3';
    if (hud.healthFill) {
      const width = `${Math.max(0, state.health)}%`;
      if (lastHud.healthWidth !== width) {
        lastHud.healthWidth = width;
        hud.healthFill.style.width = width;
      }
    }
    const car = state.player.car;
    setShown(hud.carRow, 'carRow', !state.player.onFoot && !!car);
    if (hud.carFill && car) {
      const width = `${Math.max(0, (1 - car.dmg) * 100)}%`;
      if (lastHud.carWidth !== width) {
        lastHud.carWidth = width;
        hud.carFill.style.width = width;
      }
    }
    const mission = MISSIONS[state.missionIndex] || MISSIONS[0];
    const missions = state.storyDone
      ? { num: '★', name: 'Story complete', objective: 'Solmarina is yours — free roam', timer: '' }
      : {
          num: `${state.missionIndex + 1}`,
          name: mission.name,
          objective: mission.stages[state.missionStage] || mission.stages[0],
          timer: state.missionIndex === 1 ? `⏱ ${Math.max(0, Math.ceil(state.missionTimer))}s` : '',
        };
    setText(hud.missionNum, 'missionNum', missions.num);
    setText(hud.missionObjective, 'missionObjective', `${missions.num} · ${missions.name}`);
    const objText = document.getElementById('mission-text');
    setText(objText, 'missionText', missions.objective);
    setText(hud.missionTimer, 'missionTimer', missions.timer);
    setShown(hud.missionTimer, 'missionTimerShown', missions.timer !== '');
    setText(hud.stashCount, 'stashCount', `STASHES ${state.stashesFound}/8`);
    setText(hud.prompt, 'prompt', state.prompt);
    setShown(hud.prompt, 'promptShown', state.prompt !== '');
    const showDialogue = state.missionIndex === 0 && !!state.dialogue;
    setShown(hud.dialogue, 'dialogue', showDialogue);
    if (showDialogue) setText(hud.dialogueText, 'dialogueText', state.dialogue);
    setText(hud.banner, 'banner', state.banner);
    setShown(hud.banner, 'bannerShown', state.banner !== '');
    const kmh = car ? Math.round(Math.abs(car.speed) * 3.6) : 0;
    setText(hud.speed, 'speed', !state.player.onFoot && car ? `${kmh} km/h` : '');
    // The minimap is a 2D repaint: every fifth draw is plenty.
    api._minimapTick = (api._minimapTick || 0) + 1;
    if (api._minimapTick % 5 === 1) drawMinimap(state);
  }

  function draw(state, screen, dt, time) {
    const now = performance.now();
    if (api._lastDrawWall > 0) {
      const gap = now - api._lastDrawWall;
      if (gap > 0 && gap < 1000) {
        api._frameTimeEma = api._frameTimeEma * 0.95 + gap * 0.05;
        api._frameCount += 1;
        api._qualityCooldown -= 1;
        if (api._frameCount >= QUALITY_WINDOW && api._qualityCooldown <= 0) {
          api._frameCount = 0;
          api._qualityCooldown = QUALITY_WINDOW;
          const fps = 1000 / Math.max(1, api._frameTimeEma);
          if (fps < 30 && api.quality > 0) {
            api.quality -= 1;
            applyQuality();
          } else if (fps > 50 && api.quality < QUALITY.length - 1) {
            api.quality += 1;
            applyQuality();
          }
        }
      }
    }
    api._lastDrawWall = now;
    const step = dt || 1 / 60;
    const t = time || 0;
    syncCars(state, t);
    syncPeds(state, t);
    syncPlayer(state);
    syncStashes(state, t);
    syncBeacon(state, t);
    syncSmoke(state, step);
    updateCamera(state, screen, step, t);
    renderer.render(scene, camera);
    updateHud(state, screen);
  }

  return {
    get camYaw() {
      return api.camYaw;
    },
    set camYaw(value) {
      api.camYaw = value;
    },
    get quality() {
      return api.quality;
    },
    set quality(value) {
      api.quality = value;
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

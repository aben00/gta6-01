// SUNSET HEAT — the simulation. No drawing and no DOM here: the player's
// body and cars, traffic and pedestrians, the police and the wanted level,
// and the three story missions. step() advances one fixed step and returns
// what happened as bit flags, so the caller can react (sounds, screens)
// without the world knowing about them.

import { CAR, CITY, COPS, MISSIONS, PEDS, PLAYER, SAFEHOUSE, START_MONEY, TRAFFIC, WANTED } from './config.js';
import { buildCity, nearestRoadPoint, roadLines } from './city.js';
import { ACTION_ADVANCE, ACTION_INTERACT, ACTION_PUNCH } from './input.js';
import { randPick, randRange } from './random.js';

export const EV_NONE = 0;
export const EV_MISSION = 1;
export const EV_BUSTED = 2;
export const EV_STORY = 4;
export const EV_WANTED_UP = 8;
export const EV_CRASH = 16;
export const EV_DIALOG = 32;

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}
function dist(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Push a circle out of building AABBs; returns the push vector and whether it hit. */
function collideBuildings(buildings, x, z, r) {
  let px = 0;
  let pz = 0;
  let hit = false;
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    const cx = clamp(x, b.x - b.hw, b.x + b.hw);
    const cz = clamp(z, b.z - b.hd, b.z + b.hd);
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = r - d;
      px += (dx / d) * push;
      pz += (dz / d) * push;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const left = x - (b.x - b.hw) + r;
      const right = b.x + b.hw - x + r;
      const top = z - (b.z - b.hd) + r;
      const bottom = b.z + b.hd - z + r;
      const m = Math.min(left, right, top, bottom);
      if (m === left) px -= left;
      else if (m === right) px += right;
      else if (m === top) pz -= top;
      else pz += bottom;
    }
  }
  return { x: x + px, z: z + pz, hit, nx: px, nz: pz };
}

function clampToWorld(x, z) {
  return {
    x: clamp(x, -CITY.half + 2, CITY.half - 2),
    z: clamp(z, -CITY.half + 2, CITY.waterZ - 2),
  };
}

export function createWorld(random, audio) {
  const city = buildCity(random);
  const lines = roadLines();
  let nextCarId = 1;

  const state = {
    seed: 0,
    elapsed: 0,
    money: START_MONEY,
    health: PLAYER.health,
    wanted: 0,
    quietTimer: 0,
    fallTimer: 0,
    lastCrimeAt: -999,
    missionIndex: 0,
    missionStage: 0,
    missionTimer: 0,
    missionFailed: false,
    storyDone: false,
    busted: false,
    objective: '',
    marker: null,
    dialog: null,
    dialogTimer: 0,
    impact: 0, // crash shake, decays
    player: null,
    cars: [],
    peds: [],
    officers: [],
    city,
  };

  function makeCar(kind, x, z, yaw, color) {
    return {
      id: nextCarId++,
      kind, // 'parked' | 'traffic' | 'cop' | 'player'
      x, z, yaw,
      vx: 0, vz: 0,
      speed: 0,
      steer: 0,
      color,
      // traffic AI
      lane: 'x',
      line: 0,
      dir: 1,
      cruise: TRAFFIC.speed,
      // cop AI
      ramCooldown: 0,
      sirenPhase: random() * TAU,
    };
  }

  function spawnTrafficCar(farFromPlayer) {
    const line = randPick(random, lines);
    const lane = random() < 0.5 ? 'x' : 'z';
    const dir = random() < 0.5 ? -1 : 1;
    const along = randRange(random, -170, 170);
    let x = lane === 'x' ? along : line + (dir > 0 ? -2.2 : 2.2);
    let z = lane === 'x' ? line + (dir > 0 ? -2.2 : 2.2) : along;
    if (farFromPlayer) {
      const p = state.player;
      if (p && dist(x, z, p.x, p.z) < 60) {
        x = -x;
        z = -z;
      }
    }
    const car = makeCar('traffic', x, z, lane === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI), randPick(random, city.carColors));
    car.lane = lane;
    car.line = line;
    car.dir = dir;
    car.cruise = TRAFFIC.speed + randRange(random, -TRAFFIC.speedJitter, TRAFFIC.speedJitter);
    car.speed = car.cruise;
    return car;
  }

  function spawnParkedCars() {
    const spots = [];
    for (let i = 0; i < 10; i += 1) {
      const line = randPick(random, lines);
      const along = randRange(random, -170, 170);
      const side = random() < 0.5 ? -1 : 1;
      const horizontal = random() < 0.5;
      const x = horizontal ? along : line + side * (CITY.roadWidth / 2 + 1.6);
      const z = horizontal ? line + side * (CITY.roadWidth / 2 + 1.6) : along;
      const yaw = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI);
      spots.push({ x, z, yaw });
    }
    return spots;
  }

  function spawnPed() {
    const line = randPick(random, lines);
    const along = randRange(random, -180, 180);
    const side = random() < 0.5 ? -1 : 1;
    const horizontal = random() < 0.5;
    return {
      x: horizontal ? along : line + side * (CITY.roadWidth / 2 + 2.5),
      z: horizontal ? line + side * (CITY.roadWidth / 2 + 2.5) : along,
      yaw: randRange(random, 0, TAU),
      tx: 0, tz: 0,
      speed: PEDS.walkSpeed * randRange(random, 0.8, 1.2),
      mode: 'walk', // 'walk' | 'flee' | 'down'
      downTimer: 0,
      color: randPick(random, [0xd84a5a, 0x4a7ad8, 0x4ad87a, 0xd8c44a, 0x9a4ad8, 0xd8d8d8, 0x3a3a3a]),
      walkPhase: randRange(random, 0, TAU),
      crimeCooldown: 0,
    };
  }

  function pickPedTarget(ped) {
    const line = randPick(random, lines);
    const along = randRange(random, -180, 180);
    const side = random() < 0.5 ? -1 : 1;
    const horizontal = random() < 0.5;
    ped.tx = horizontal ? along : line + side * (CITY.roadWidth / 2 + 2.5);
    ped.tz = horizontal ? line + side * (CITY.roadWidth / 2 + 2.5) : along;
  }

  function setDialog(speaker, lines) {
    state.dialog = { speaker, lines, index: 0 };
    state.dialogTimer = 0;
  }

  function advanceDialog() {
    if (!state.dialog) return false;
    state.dialog.index += 1;
    state.dialogTimer = 0;
    if (state.dialog.index >= state.dialog.lines.length) {
      state.dialog = null;
      return true;
    }
    return false;
  }

  function currentMission() {
    return MISSIONS[state.missionIndex] ?? null;
  }

  function applyStage() {
    const m = currentMission();
    if (!m) {
      state.objective = state.storyDone ? 'Free roam — Solmarina is yours' : '';
      state.marker = null;
      return;
    }
    const stage = m.stages[state.missionStage];
    state.objective = stage.objective;
    state.marker = stage.target ? { x: stage.target[0], z: stage.target[1] } : null;
    state.missionTimer = stage.timer ?? 0;
    if (stage.forceWanted) {
      state.wanted = stage.forceWanted;
      state.lastCrimeAt = state.elapsed;
      state.quietTimer = 0;
    }
  }

  function startMission(index) {
    state.missionIndex = index;
    state.missionStage = 0;
    state.missionFailed = false;
    const m = currentMission();
    if (!m) return;
    setDialog(m.contact, m.briefing);
    applyStage();
  }

  function completeMission() {
    const m = currentMission();
    if (!m) return EV_NONE;
    state.money += m.reward;
    audio.coin();
    audio.missionDone();
    let events = EV_MISSION;
    if (state.missionIndex >= MISSIONS.length - 1) {
      state.storyDone = true;
      state.missionIndex = MISSIONS.length;
      state.objective = 'Story complete — free roam';
      state.marker = null;
      setDialog('MARCO', [
        'MARCO: $750. You did it, kid. Solmarina is yours now.',
        'MARCO: Keep the wheels. Keep the money. Stay out of the cells.',
      ]);
      events |= EV_STORY;
    } else {
      setDialog('MARCO', [`MARCO: $${m.reward} in your pocket. Good work.`]);
      startMission(state.missionIndex + 1);
    }
    return events;
  }

  function addWanted(n, reason) {
    if (n <= 0) return EV_NONE;
    const before = state.wanted;
    state.wanted = Math.min(5, state.wanted + n);
    state.lastCrimeAt = state.elapsed;
    state.quietTimer = 0;
    state.fallTimer = 0;
    if (state.wanted > before) return EV_WANTED_UP;
    return EV_NONE;
  }

  function reset() {
    state.elapsed = 0;
    state.money = START_MONEY;
    state.health = PLAYER.health;
    state.wanted = 0;
    state.quietTimer = 0;
    state.fallTimer = 0;
    state.lastCrimeAt = -999;
    state.missionIndex = 0;
    state.missionStage = 0;
    state.missionTimer = 0;
    state.missionFailed = false;
    state.storyDone = false;
    state.busted = false;
    state.dialog = null;
    state.impact = 0;
    state.cars = [];
    state.peds = [];
    state.officers = [];
    state.player = {
      x: 12, z: 34, yaw: Math.PI,
      vx: 0, vz: 0,
      speed: 0,
      onFoot: true,
      car: null,
      punchTimer: 0,
      punchAnim: 0,
      walkPhase: 0,
      moving: false,
      throttle: false,
    };
    for (const spot of spawnParkedCars()) {
      state.cars.push(makeCar('parked', spot.x, spot.z, spot.yaw, randPick(random, city.carColors)));
    }
    for (let i = 0; i < TRAFFIC.count; i += 1) state.cars.push(spawnTrafficCar(false));
    for (let i = 0; i < PEDS.count; i += 1) {
      const ped = spawnPed();
      pickPedTarget(ped);
      state.peds.push(ped);
    }
    startMission(0);
  }

  function nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      const d = dist(x, z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    const p = state.player;
    p.onFoot = false;
    p.car = car;
    car.kind = 'player';
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
    p.yaw = car.yaw;
    audio.steal();
  }

  function exitCar() {
    const p = state.player;
    const car = p.car;
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    const sideX = Math.cos(car.yaw);
    const sideZ = -Math.sin(car.yaw);
    p.x = car.x + sideX * 2.2;
    p.z = car.z + sideZ * 2.2;
    const fixed = clampToWorld(p.x, p.z);
    p.x = fixed.x;
    p.z = fixed.z;
    p.yaw = car.yaw;
    p.onFoot = true;
    p.car = null;
  }

  function tryInteract() {
    const p = state.player;
    if (p.onFoot) {
      const car = nearestCar(p.x, p.z, CAR.enterRange);
      if (!car) return EV_NONE;
      const wasTraffic = car.kind === 'traffic';
      enterCar(car);
      if (wasTraffic) {
        state.cars.push(spawnTrafficCar(true));
        return addWanted(WANTED.stealCar, 'steal');
      }
      return EV_NONE;
    }
    exitCar();
    return EV_NONE;
  }

  function punch() {
    const p = state.player;
    if (!p.onFoot || p.punchTimer > 0) return EV_NONE;
    p.punchTimer = PLAYER.punchCooldown;
    p.punchAnim = 0.28;
    audio.punch();
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    let events = EV_NONE;
    for (const ped of state.peds) {
      if (ped.mode === 'down') continue;
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > PLAYER.punchRange || d < 0.01) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < Math.cos(PLAYER.punchArc)) continue;
      ped.mode = 'down';
      ped.downTimer = 2.5;
      ped.x += fx * 1.2;
      ped.z += fz * 1.2;
      if (ped.crimeCooldown <= 0) {
        ped.crimeCooldown = 2;
        events |= addWanted(WANTED.punchPedestrian, 'punch');
      }
    }
    for (const off of state.officers) {
      if (off.downTimer > 0) continue;
      const dx = off.x - p.x;
      const dz = off.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > PLAYER.punchRange || d < 0.01) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < Math.cos(PLAYER.punchArc)) continue;
      off.downTimer = 3;
      off.x += fx * 1.4;
      off.z += fz * 1.4;
      events |= addWanted(WANTED.punchCop, 'punch-cop');
    }
    return events;
  }

  function updatePlayerOnFoot(dt, move, look) {
    const p = state.player;
    const camYaw = look.camYaw;
    const f = move.forward;
    const s = move.strafe;
    const mag = Math.hypot(f, s);
    p.moving = mag > 0;
    if (mag > 0) {
      const nf = f / mag;
      const ns = s / mag;
      // Camera-relative: forward is where the camera looks (camYaw), strafe is right.
      const dirX = Math.sin(camYaw) * nf + Math.cos(camYaw) * ns;
      const dirZ = Math.cos(camYaw) * nf - Math.sin(camYaw) * ns;
      const speed = move.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const tx = dirX * speed;
      const tz = dirZ * speed;
      p.vx += (tx - p.vx) * Math.min(1, PLAYER.accel * dt / speed);
      p.vz += (tz - p.vz) * Math.min(1, PLAYER.accel * dt / speed);
      p.yaw = angleLerp(p.yaw, Math.atan2(dirX, dirZ), Math.min(1, 14 * dt));
      p.walkPhase += dt * speed * 1.6;
    } else {
      p.vx *= Math.max(0, 1 - 10 * dt);
      p.vz *= Math.max(0, 1 - 10 * dt);
    }
    p.speed = Math.hypot(p.vx, p.vz);
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const fixed = collideBuildings(city.buildings, p.x, p.z, PLAYER.radius);
    p.x = fixed.x;
    p.z = fixed.z;
    const clamped = clampToWorld(p.x, p.z);
    p.x = clamped.x;
    p.z = clamped.z;
    // Soft push out of cars and pedestrians.
    for (const car of state.cars) {
      const dx = p.x - car.x;
      const dz = p.z - car.z;
      const d = Math.hypot(dx, dz);
      const min = CAR.radius * 0.8 + PLAYER.radius;
      if (d > 0.01 && d < min) {
        p.x = car.x + (dx / d) * min;
        p.z = car.z + (dz / d) * min;
      }
    }
    if (p.punchTimer > 0) p.punchTimer -= dt;
    if (p.punchAnim > 0) p.punchAnim -= dt;
  }

  function updatePlayerCar(dt, move) {
    const p = state.player;
    const car = p.car;
    if (!car) return EV_NONE;
    let events = EV_NONE;
    const forward = move.forward;
    const brake = move.forward < 0;
    p.throttle = forward > 0;
    if (forward > 0) {
      car.speed += CAR.accel * dt;
    } else if (brake) {
      if (car.speed > 0.5) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    } else {
      car.speed -= Math.sign(car.speed) * CAR.drag * 2.2 * dt;
      if (Math.abs(car.speed) < 0.3) car.speed = 0;
    }
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    const speedFactor = 1 - Math.min(1, Math.abs(car.speed) / CAR.maxSpeed) * 0.55;
    const targetSteer = move.strafe * CAR.steerMax * speedFactor;
    car.steer += (targetSteer - car.steer) * Math.min(1, 10 * dt);
    if (Math.abs(car.speed) > 0.1) {
      car.yaw += (car.speed / 2.7) * Math.tan(car.steer) * dt;
    }
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    car.vx = fx * car.speed;
    car.vz = fz * car.speed;
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    const fixed = collideBuildings(city.buildings, car.x, car.z, CAR.radius);
    if (fixed.hit) {
      const impactSpeed = Math.abs(car.speed);
      // Kill the velocity component into the wall.
      const nx = fixed.nx;
      const nz = fixed.nz;
      const nl = Math.hypot(nx, nz);
      if (nl > 0.001) {
        const dot = (car.vx * nx + car.vz * nz) / nl;
        if (dot < 0) {
          car.vx -= (nx / nl) * dot;
          car.vz -= (nz / nl) * dot;
          car.speed = Math.hypot(car.vx, car.vz) * Math.sign(car.speed);
          if (impactSpeed > 6) {
            state.impact = Math.min(1, impactSpeed / 24);
            audio.crash(impactSpeed / 20);
            events |= EV_CRASH;
          }
        }
      }
      car.x = fixed.x;
      car.z = fixed.z;
    }
    const clamped = clampToWorld(car.x, car.z);
    if (clamped.x !== car.x || clamped.z !== car.z) {
      car.x = clamped.x;
      car.z = clamped.z;
      car.speed *= 0.5;
    }
    p.x = car.x;
    p.z = car.z;
    p.yaw = car.yaw;
    p.speed = Math.abs(car.speed);
    p.moving = Math.abs(car.speed) > 0.5;
    return events;
  }

  function updateTraffic(dt) {
    const p = state.player;
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      // Slow for a car ahead on the same lane.
      let target = car.cruise;
      for (const other of state.cars) {
        if (other === car || other.kind === 'parked') continue;
        if (other.lane !== car.lane || other.line !== car.line || other.dir !== car.dir) continue;
        const ahead = car.lane === 'x' ? (other.x - car.x) * car.dir : (other.z - car.z) * car.dir;
        const side = car.lane === 'x' ? Math.abs(other.z - car.z) : Math.abs(other.x - car.x);
        if (ahead > 0 && ahead < 9 && side < 3) target = 0;
      }
      // Slow for the player crossing in front.
      if (p.onFoot) {
        const d = dist(car.x, car.z, p.x, p.z);
        if (d < 7) target = Math.min(target, 2);
      }
      car.speed += (target - car.speed) * Math.min(1, 2 * dt);
      car.x += Math.sin(car.yaw) * car.speed * dt;
      car.z += Math.cos(car.yaw) * car.speed * dt;
      // At an intersection, sometimes turn onto the crossing road.
      const along = car.lane === 'x' ? car.x : car.z;
      for (const line of lines) {
        if (Math.abs(along - line) < car.speed * dt * 0.6 + 0.4 && random() < 0.1) {
          const newDir = random() < 0.5 ? -1 : 1;
          if (car.lane === 'x') {
            car.lane = 'z';
            car.line = line;
            car.dir = newDir;
            car.x = line + (newDir > 0 ? -2.2 : 2.2);
            car.yaw = newDir > 0 ? 0 : Math.PI;
          } else {
            car.lane = 'x';
            car.line = line;
            car.dir = newDir;
            car.z = line + (newDir > 0 ? -2.2 : 2.2);
            car.yaw = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
          break;
        }
      }
      // Wrap around the city edges.
      if (car.x > 195 || car.x < -195 || car.z > 195 || car.z < -195) {
        const fresh = spawnTrafficCar(true);
        car.x = fresh.x;
        car.z = fresh.z;
        car.yaw = fresh.yaw;
        car.lane = fresh.lane;
        car.line = fresh.line;
        car.dir = fresh.dir;
        car.speed = fresh.cruise;
        car.cruise = fresh.cruise;
      }
    }
    // Keep traffic cars from overlapping each other.
    const traffic = state.cars.filter((c) => c.kind === 'traffic');
    for (let i = 0; i < traffic.length; i += 1) {
      for (let j = i + 1; j < traffic.length; j += 1) {
        const a = traffic[i];
        const b = traffic[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 5) {
          const push = (5 - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          a.x -= nx * push;
          a.z -= nz * push;
          b.x += nx * push;
          b.z += nz * push;
        }
      }
    }
  }

  function updatePeds(dt) {
    const p = state.player;
    const playerCar = !p.onFoot ? p.car : null;
    for (const ped of state.peds) {
      if (ped.crimeCooldown > 0) ped.crimeCooldown -= dt;
      if (ped.mode === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.mode = 'flee';
          pickPedTarget(ped);
        }
        continue;
      }
      // Flee from a fast car or a punching player nearby.
      let flee = false;
      if (playerCar && Math.abs(playerCar.speed) > 4 && dist(ped.x, ped.z, playerCar.x, playerCar.z) < 9) flee = true;
      if (p.onFoot && p.punchAnim > 0 && dist(ped.x, ped.z, p.x, p.z) < 5) flee = true;
      if (flee && ped.mode !== 'flee') {
        ped.mode = 'flee';
        const away = Math.atan2(ped.x - p.x, ped.z - p.z);
        ped.tx = ped.x + Math.sin(away) * 40;
        ped.tz = ped.z + Math.cos(away) * 40;
      }
      const dx = ped.tx - ped.x;
      const dz = ped.tz - ped.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        if (ped.mode === 'flee') ped.mode = 'walk';
        pickPedTarget(ped);
        continue;
      }
      const speed = ped.mode === 'flee' ? PEDS.fleeSpeed : ped.speed;
      ped.yaw = angleLerp(ped.yaw, Math.atan2(dx, dz), Math.min(1, 8 * dt));
      ped.x += (dx / d) * speed * dt;
      ped.z += (dz / d) * speed * dt;
      ped.walkPhase += dt * speed * 2.2;
      const fixed = collideBuildings(city.buildings, ped.x, ped.z, PEDS.radius);
      ped.x = fixed.x;
      ped.z = fixed.z;
      const clamped = clampToWorld(ped.x, ped.z);
      ped.x = clamped.x;
      ped.z = clamped.z;
    }
  }

  function nearestCopDistance() {
    const p = state.player;
    let best = Infinity;
    for (const car of state.cars) {
      if (car.kind !== 'cop') continue;
      best = Math.min(best, dist(car.x, car.z, p.x, p.z));
    }
    for (const off of state.officers) best = Math.min(best, dist(off.x, off.z, p.x, p.z));
    return best;
  }

  function spawnCopCar() {
    const p = state.player;
    const angle = randRange(random, 0, TAU);
    let x = p.x + Math.sin(angle) * COPS.spawnDistance;
    let z = p.z + Math.cos(angle) * COPS.spawnDistance;
    const road = nearestRoadPoint(x, z);
    x = road.x;
    z = road.z;
    const car = makeCar('cop', x, z, 0, 0x1a1a22);
    car.speed = COPS.chaseSpeed * 0.7;
    car.sirenPhase = random() * TAU;
    state.cars.push(car);
    return car;
  }

  function updateCops(dt) {
    const p = state.player;
    const wantCars = state.wanted > 0 ? Math.min(COPS.maxCars, state.wanted + 1) : 0;
    let copCars = state.cars.filter((c) => c.kind === 'cop');
    while (copCars.length < wantCars) {
      spawnCopCar();
      copCars = state.cars.filter((c) => c.kind === 'cop');
    }
    if (state.wanted === 0) {
      // Heat off: cruisers leave, officers stand down.
      state.cars = state.cars.filter((c) => c.kind !== 'cop');
      state.officers = [];
      return EV_NONE;
    }
    let events = EV_NONE;
    for (const car of copCars) {
      car.sirenPhase += dt * 6;
      const dx = p.x - car.x;
      const dz = p.z - car.z;
      const d = Math.hypot(dx, dz);
      const desiredYaw = Math.atan2(dx, dz);
      car.yaw = angleLerp(car.yaw, desiredYaw, Math.min(1, 2.2 * dt));
      const slow = d < 12 ? 0.55 : 1;
      car.speed += (COPS.chaseSpeed * slow - car.speed) * Math.min(1, 1.5 * dt);
      car.x += Math.sin(car.yaw) * car.speed * dt;
      car.z += Math.cos(car.yaw) * car.speed * dt;
      const fixed = collideBuildings(city.buildings, car.x, car.z, CAR.radius);
      if (fixed.hit) {
        car.x = fixed.x;
        car.z = fixed.z;
        car.speed *= 0.6;
      }
      const clamped = clampToWorld(car.x, car.z);
      car.x = clamped.x;
      car.z = clamped.z;
      if (car.ramCooldown > 0) car.ramCooldown -= dt;
      // Ram the player.
      if (d < CAR.radius + 1.2 && car.ramCooldown <= 0) {
        car.ramCooldown = COPS.ramCooldown;
        state.health -= COPS.ramDamage;
        state.impact = 0.8;
        audio.crash(0.8);
        if (!p.onFoot && p.car) {
          p.car.speed *= 0.55;
          p.car.x += (dx / (d || 1)) * -1.5;
          p.car.z += (dz / (d || 1)) * -1.5;
        } else {
          p.x -= (dx / (d || 1)) * 1.5;
          p.z -= (dz / (d || 1)) * 1.5;
        }
        events |= EV_CRASH;
      }
      // On foot and close: send an officer out.
      if (p.onFoot && d < COPS.officerRange && state.officers.length < state.wanted + 1) {
        state.officers.push({
          x: car.x + randRange(random, -2, 2),
          z: car.z + randRange(random, -2, 2),
          yaw: car.yaw,
          downTimer: 0,
          bustTimer: 0,
          walkPhase: randRange(random, 0, TAU),
        });
      }
    }
    // Officers chase on foot.
    for (let i = state.officers.length - 1; i >= 0; i -= 1) {
      const off = state.officers[i];
      if (off.downTimer > 0) {
        off.downTimer -= dt;
        continue;
      }
      const dx = p.x - off.x;
      const dz = p.z - off.z;
      const d = Math.hypot(dx, dz);
      off.yaw = angleLerp(off.yaw, Math.atan2(dx, dz), Math.min(1, 8 * dt));
      const speed = d > 3 ? COPS.officerSpeed : COPS.officerSpeed * 0.6;
      off.x += Math.sin(off.yaw) * speed * dt;
      off.z += Math.cos(off.yaw) * speed * dt;
      off.walkPhase += dt * speed * 2.2;
      const fixed = collideBuildings(city.buildings, off.x, off.z, PEDS.radius);
      off.x = fixed.x;
      off.z = fixed.z;
      if (d < 1.7) {
        off.bustTimer += dt;
        if (off.bustTimer >= COPS.bustSeconds) {
          state.busted = true;
          return EV_BUSTED;
        }
      } else {
        off.bustTimer = Math.max(0, off.bustTimer - dt * 2);
      }
      if (d > 90) state.officers.splice(i, 1);
    }
    return events;
  }

  function updateWanted(dt) {
    if (state.wanted === 0) return;
    if (state.elapsed - state.lastCrimeAt < WANTED.quietSeconds) {
      state.quietTimer = 0;
      return;
    }
    if (nearestCopDistance() < 45) {
      state.quietTimer = 0;
      return;
    }
    state.quietTimer += dt;
    if (state.quietTimer > 2) {
      state.fallTimer += dt;
      if (state.fallTimer >= WANTED.fallEvery) {
        state.fallTimer = 0;
        state.wanted -= 1;
      }
    }
  }

  function checkCarPedHits() {
    const p = state.player;
    if (p.onFoot || !p.car) return EV_NONE;
    const car = p.car;
    if (Math.abs(car.speed) < 3) return EV_NONE;
    let events = EV_NONE;
    for (const ped of state.peds) {
      if (ped.mode === 'down' || ped.crimeCooldown > 0) continue;
      if (dist(ped.x, ped.z, car.x, car.z) < CAR.radius * 0.8) {
        ped.mode = 'down';
        ped.downTimer = 3;
        ped.crimeCooldown = 3;
        const fx = Math.sin(car.yaw);
        const fz = Math.cos(car.yaw);
        ped.x += fx * 2;
        ped.z += fz * 2;
        audio.crash(0.6);
        events |= addWanted(WANTED.hitPedestrian, 'hit-ped');
        events |= EV_CRASH;
      }
    }
    // Ramming a cruiser is a crime too.
    for (const cop of state.cars) {
      if (cop.kind !== 'cop' || cop.ramCooldown > 0) continue;
      if (dist(cop.x, cop.z, car.x, car.z) < CAR.radius + 1.6 && Math.abs(car.speed) > 5) {
        cop.ramCooldown = 1.5;
        cop.speed *= 0.5;
        state.impact = 0.7;
        audio.crash(0.9);
        events |= addWanted(WANTED.ramCopCar, 'ram-cop');
        events |= EV_CRASH;
      }
    }
    return events;
  }

  function updateMissions(dt) {
    const m = currentMission();
    if (!m) return EV_NONE;
    const stage = m.stages[state.missionStage];
    const p = state.player;
    if (stage.timer) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) {
        state.missionTimer = stage.timer;
        state.missionFailed = true;
        audio.missionFail();
        setDialog('MARCO', [
          'MARCO: Too slow. The sun is gone and so is the deal — for now.',
          'MARCO: Take another run at it. The pier is still there.',
        ]);
        return EV_DIALOG;
      }
    }
    if (m.id === 'first-wheels' && state.missionStage === 0) {
      if (!p.onFoot) {
        state.missionStage = 1;
        applyStage();
        return EV_NONE;
      }
      return EV_NONE;
    }
    if (m.id === 'heat-escape' && state.missionStage === 0) {
      if (state.wanted === 0) {
        state.missionStage = 1;
        applyStage();
        setDialog('MARCO', ['MARCO: Heat is off. Now get to the safehouse before they pick you up again.']);
        return EV_DIALOG;
      }
      return EV_NONE;
    }
    if (stage.target) {
      if (dist(p.x, p.z, stage.target[0], stage.target[1]) < 9) {
        return completeMission();
      }
    }
    return EV_NONE;
  }

  function applyBusted() {
    state.money = Math.max(0, state.money - COPS.bustFine);
    state.wanted = 0;
    state.health = PLAYER.health;
    state.busted = false;
    state.cars = state.cars.filter((c) => c.kind !== 'cop');
    state.officers = [];
    const p = state.player;
    if (!p.onFoot && p.car) {
      p.car.kind = 'parked';
      p.car.speed = 0;
      p.car = null;
      p.onFoot = true;
    }
    p.x = SAFEHOUSE[0];
    p.z = SAFEHOUSE[1];
    p.vx = 0;
    p.vz = 0;
    p.yaw = Math.PI;
    setDialog('MARCO', [
      'MARCO: Busted. They took your fine and let you walk.',
      'MARCO: The safehouse is yours. Get back out there when you are ready.',
    ]);
  }

  /** One fixed step. `move` is {forward, strafe, run}; `look` carries camYaw. */
  function step(dt, move, look, actions) {
    let events = EV_NONE;
    state.elapsed += dt;
    if (state.impact > 0) state.impact = Math.max(0, state.impact - dt * 1.4);
    if (state.health < PLAYER.health && state.wanted === 0) {
      state.health = Math.min(PLAYER.health, state.health + 2 * dt);
    }

    if (actions & ACTION_INTERACT) events |= tryInteract();
    if (actions & ACTION_PUNCH) events |= punch();

    if (state.player.onFoot) updatePlayerOnFoot(dt, move, look);
    else events |= updatePlayerCar(dt, move);

    events |= checkCarPedHits();
    updateTraffic(dt);
    updatePeds(dt);
    events |= updateCops(dt);
    updateWanted(dt);
    events |= updateMissions(dt);

    if (state.dialog) {
      state.dialogTimer += dt;
      if (state.dialogTimer > 8) advanceDialog();
    }
    if (actions & ACTION_ADVANCE) {
      if (advanceDialog()) events |= EV_DIALOG;
    }
    if (state.health <= 0 && !state.busted) {
      state.busted = true;
      events |= EV_BUSTED;
    }
    return events;
  }

  reset();

  return {
    state,
    reset,
    step,
    advanceDialog,
    applyBusted,
    currentMission,
    nearestCopDistance,
    city,
    /** HUD-friendly speed in km/h. */
    speedKmh() {
      const p = state.player;
      return Math.round(Math.abs(p.onFoot ? p.speed : (p.car ? p.car.speed : 0)) * 3.6);
    },
    // Staging helpers for screenshots and play-tests: they only put the world
    // in states a real player can reach (a mission, a wanted level, a car).
    debug: {
      setMission(index) {
        startMission(index);
      },
      setWanted(n) {
        state.wanted = n;
        state.lastCrimeAt = state.elapsed;
        state.quietTimer = 0;
      },
      placePlayer(x, z, yaw) {
        const p = state.player;
        if (!p.onFoot && p.car) {
          p.car.kind = 'parked';
          p.car.speed = 0;
          p.car = null;
          p.onFoot = true;
        }
        p.x = x;
        p.z = z;
        p.yaw = yaw;
        p.vx = 0;
        p.vz = 0;
      },
      placeInCar(x, z, yaw) {
        let car = null;
        let best = Infinity;
        for (const c of state.cars) {
          if (c.kind !== 'parked') continue;
          const d = dist(x, z, c.x, c.z);
          if (d < best) {
            best = d;
            car = c;
          }
        }
        if (!car) return;
        car.x = x;
        car.z = z;
        car.yaw = yaw;
        car.speed = 0;
        car.vx = 0;
        car.vz = 0;
        const p = state.player;
        p.x = x;
        p.z = z;
        if (!p.onFoot && p.car) {
          p.car.kind = 'parked';
          p.car.speed = 0;
        }
        enterCar(car);
      },
      spawnCops(n) {
        for (let i = 0; i < n; i += 1) spawnCopCar();
      },
    },
  };
}

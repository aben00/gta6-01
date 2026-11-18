// Sunset Heat — the rules, with no drawing and no browser in them: the
// player on foot and in cars, traffic and pedestrians, the wanted level
// and the police who answer it, the three story jobs, the hidden stashes,
// car damage and the safehouse repair, the bust and the save. step()
// advances one fixed step and returns what happened as bit flags, so the
// caller can play sounds and show banners without the world knowing
// about screens or speakers.
//
// Coordinates: x east, z north toward the beach. A heading of 0 faces
// north (+z); forward is (sin(yaw), cos(yaw)).

import {
  BEACH_Z, BUST_FINE, CAR, COPS, DIALOGUE, MARINA, MARKER_RADIUS, MAX_WANTED,
  MISSIONS, OFFICERS, PARKED, PEDS, PIER, SAFEHOUSE, SAVE_KEY, SPAWN, STASHES,
  START_MONEY, STREET_STEP, TRAFFIC, WALK, WANTED_DECAY_SECONDS, WORLD,
} from './config.js';
import { generateLayout } from './city.js';

export const EV_STASH = 1;
export const EV_MISSION = 2;
export const EV_WANTED = 4;
export const EV_BUSTED = 8;
export const EV_PUNCH = 16;
export const EV_HORN = 32;
export const EV_CRASH = 64;
export const EV_STORY = 128;
export const EV_REPAIRED = 256;
export const EV_TICK = 512;
export const EV_HITPED = 1024;

const CAR_PAINT = [0xd21f2b, 0x2b6fd2, 0xe8e4da, 0x222226, 0x3f7a4a, 0xc96a2b, 0x7a4a9c, 0x9c2b2b];
const SHIRT_COLORS = [0x3a6fd2, 0xd23a5e, 0x3aa655, 0xd2a13a, 0x7a5ad2, 0xd2d2d2, 0x2b2b2b, 0xc96a2b];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
function turnToward(current, target, maxStep) {
  const diff = wrapAngle(target - current);
  return current + clamp(diff, -maxStep, maxStep);
}
function dist2(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}
/** Push a circle out of an axis-aligned box; null when clear. */
function circleBoxPush(x, z, radius, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    return { x: (dx / d) * (radius - d), z: (dz / d) * (radius - d) };
  }
  const left = x - box.minX;
  const right = box.maxX - x;
  const top = z - box.minZ;
  const bottom = box.maxZ - z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: -(left + radius), z: 0 };
  if (m === right) return { x: right + radius, z: 0 };
  if (m === top) return { x: 0, z: -(top + radius) };
  return { x: 0, z: bottom + radius };
}
function nearestStreet(value) {
  return clamp(Math.round(value / STREET_STEP) * STREET_STEP, -240, 240);
}

export function createWorld(random) {
  const layout = generateLayout(random);
  const colliders = [];
  for (const b of layout.buildings) {
    colliders.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
  }
  colliders.push({ minX: SAFEHOUSE.x - 5.5, maxX: SAFEHOUSE.x + 5.5, minZ: SAFEHOUSE.z - 4, maxZ: SAFEHOUSE.z + 4 });
  colliders.push({ minX: MARINA.x - 3, maxX: MARINA.x + 3, minZ: MARINA.z - 2.5, maxZ: MARINA.z + 2.5 });

  let carId = 0;
  const state = {
    player: { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw, onFoot: true, car: null },
    cars: [],
    peds: [],
    officers: [],
    stashes: [],
    stashesFound: 0,
    money: START_MONEY,
    health: 100,
    wanted: 0,
    missionIndex: 0,
    missionStage: 0,
    missionTimer: MISSIONS[1].timeLimit,
    storyDone: false,
    busted: false,
    prompt: '',
    repairing: false,
    banner: '',
    bannerTimer: 0,
    dialogue: DIALOGUE.intro,
    objective: { x: MARINA.x, z: MARINA.z },
    elapsed: 0,
    lastTickSecond: -1,
    crimeTimer: 0,
    lastHitAt: -99,
  };

  function showBanner(text, seconds) {
    state.banner = text;
    state.bannerTimer = seconds || 3;
  }

  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1,
        money: state.money,
        missionIndex: state.missionIndex,
        missionStage: state.missionStage,
        storyDone: state.storyDone,
        stashesFound: state.stashesFound,
        found: state.stashes.map((s) => (s.found ? 1 : 0)),
        health: state.health,
      }));
    } catch {
      // Storage can be off: progress then lasts this visit only.
    }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return;
      state.money = data.money ?? START_MONEY;
      state.missionIndex = clamp(data.missionIndex ?? 0, 0, MISSIONS.length);
      state.missionStage = data.missionStage ?? 0;
      state.storyDone = !!data.storyDone;
      state.stashesFound = data.stashesFound ?? 0;
      state.objective =
        state.storyDone || state.missionIndex >= MISSIONS.length ? null
        : state.missionIndex === 0 ? { x: MARINA.x, z: MARINA.z }
        : state.missionIndex === 1 ? { x: PIER.x, z: PIER.z }
        : { x: SAFEHOUSE.x, z: SAFEHOUSE.z };
      if (Array.isArray(data.found)) {
        data.found.forEach((f, i) => {
          if (f && state.stashes[i]) state.stashes[i].found = true;
        });
      }
      state.health = data.health ?? 100;
      state.dialogue = state.missionIndex === 0 ? DIALOGUE.intro : state.missionIndex === 1 ? DIALOGUE.marina : DIALOGUE.setup;
    } catch {
      // A corrupt save is ignored, not fatal.
    }
  }

  function randomIntersection() {
    return {
      x: (random.int(-4, 5)) * STREET_STEP,
      z: (random.int(-4, 5)) * STREET_STEP,
    };
  }

  function makeCar(kind, x, z, yaw) {
    const taxi = kind === 'traffic' && random.chance(TRAFFIC.taxiChance);
    const car = {
      id: carId++,
      kind: taxi ? 'taxi' : kind,
      x, z, yaw,
      speed: 0,
      dmg: 0,
      color: kind === 'cop' ? 0x14161c : taxi ? 0xf2c200 : random.pick(CAR_PAINT),
      targetX: x,
      targetZ: z,
      axis: random.chance(0.5) ? 'x' : 'z',
      dir: random.chance(0.5) ? 1 : -1,
      ramCooldown: 0,
    };
    return car;
  }

  function spawnTrafficCar() {
    const at = randomIntersection();
    const car = makeCar('traffic', at.x, at.z, random.chance(0.5) ? 0 : Math.PI / 2);
    pickNextStreetTarget(car);
    return car;
  }

  function pickNextStreetTarget(car) {
    const cx = nearestStreet(car.x);
    const cz = nearestStreet(car.z);
    if (random.chance(TRAFFIC.turnChance)) {
      car.axis = car.axis === 'x' ? 'z' : 'x';
      car.dir = random.chance(0.5) ? 1 : -1;
    }
    if (car.axis === 'x') {
      let next = cx + car.dir * STREET_STEP;
      if (next > 240 || next < -240) {
        car.dir *= -1;
        next = cx + car.dir * STREET_STEP;
      }
      car.targetX = next;
      car.targetZ = cz;
    } else {
      let next = cz + car.dir * STREET_STEP;
      if (next > 240 || next < -240) {
        car.dir *= -1;
        next = cz + car.dir * STREET_STEP;
      }
      car.targetX = cx;
      car.targetZ = next;
    }
  }

  function spawnPed() {
    const at = randomIntersection();
    const ped = {
      x: at.x + random.range(-8, 8),
      z: at.z + random.range(-8, 8),
      yaw: random.range(0, Math.PI * 2),
      speed: random.range(PEDS.walkMin, PEDS.walkMax),
      mode: 'walk',
      modeTimer: 0,
      targetX: at.x,
      targetZ: at.z,
      fleeX: 0,
      fleeZ: 0,
      shirt: random.pick(SHIRT_COLORS),
      bob: random.range(0, Math.PI * 2),
    };
    pickPedTarget(ped);
    return ped;
  }

  function pickPedTarget(ped) {
    const at = randomIntersection();
    ped.targetX = at.x + random.range(-9, 9);
    ped.targetZ = at.z + random.range(-9, 9);
  }

  function spawnCop() {
    const angle = random.range(0, Math.PI * 2);
    const x = nearestStreet(state.player.x + Math.cos(angle) * COPS.spawnDistance);
    const z = nearestStreet(state.player.z + Math.sin(angle) * COPS.spawnDistance);
    const cop = makeCar('cop', x, z, 0);
    cop.targetX = state.player.x;
    cop.targetZ = state.player.z;
    state.cars.push(cop);
    return cop;
  }

  function spawnOfficer() {
    const angle = random.range(0, Math.PI * 2);
    state.officers.push({
      x: clamp(state.player.x + Math.cos(angle) * OFFICERS.spawnDistance, -260, 260),
      z: clamp(state.player.z + Math.sin(angle) * OFFICERS.spawnDistance, -260, 260),
      yaw: 0,
      grab: 0,
      shirt: 0x1c2f6b,
      bob: random.range(0, Math.PI * 2),
    });
  }

  function addWanted(amount) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + amount, 0, MAX_WANTED);
    state.crimeTimer = 0;
    return state.wanted > before ? EV_WANTED : 0;
  }

  function reset() {
    state.player.x = SPAWN.x;
    state.player.z = SPAWN.z;
    state.player.yaw = SPAWN.yaw;
    state.player.onFoot = true;
    state.player.car = null;
    state.cars = [];
    state.peds = [];
    state.officers = [];
    state.stashes = STASHES.map((s) => ({ x: s.x, z: s.z, value: s.value, found: false }));
    state.stashesFound = 0;
    state.money = START_MONEY;
    state.health = 100;
    state.wanted = 0;
    state.missionIndex = 0;
    state.missionStage = 0;
    state.missionTimer = MISSIONS[1].timeLimit;
    state.storyDone = false;
    state.busted = false;
    state.prompt = '';
    state.repairing = false;
    state.banner = '';
    state.bannerTimer = 0;
    state.dialogue = DIALOGUE.intro;
    state.objective = { x: MARINA.x, z: MARINA.z };
    state.elapsed = 0;
    state.lastTickSecond = -1;
    state.crimeTimer = 0;
    state.lastHitAt = -99;
    const parkedSpots = [
      [3, 14, 0], [-8, 40, 0], [14, -30, Math.PI / 2], [-40, 8, Math.PI / 2],
      [60, -8, 0], [-70, -60, Math.PI], [90, 60, Math.PI / 2], [-120, -30, 0],
    ];
    for (let i = 0; i < PARKED.count; i += 1) {
      const spot = parkedSpots[i % parkedSpots.length];
      state.cars.push(makeCar('parked', spot[0], spot[1], spot[2]));
    }
    for (let i = 0; i < TRAFFIC.count; i += 1) state.cars.push(spawnTrafficCar());
    for (let i = 0; i < PEDS.count; i += 1) state.peds.push(spawnPed());
    load();
  }

  function enterCar(car) {
    state.player.car = car;
    state.player.onFoot = false;
    state.player.x = car.x;
    state.player.z = car.z;
    state.player.yaw = car.yaw;
    car.speed = 0;
    if (car.kind === 'traffic' || car.kind === 'taxi') {
      car.kind = 'parked';
      showBanner('Car stolen ★ — the owner will call it in', 2.5);
      addWanted(1);
    }
  }

  function exitCar() {
    const car = state.player.car;
    if (!car) return;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.x = car.x + Math.cos(car.yaw) * 2.4;
    state.player.z = car.z - Math.sin(car.yaw) * 2.4;
    state.player.yaw = car.yaw;
    car.speed = 0;
  }

  /** E: grab a stash, get in a car, or step out of one. */
  function interact() {
    if (!state.player.onFoot) {
      exitCar();
      return 0;
    }
    for (const stash of state.stashes) {
      if (!stash.found && dist2(state.player.x, state.player.z, stash.x, stash.z) < 3.2) {
        stash.found = true;
        state.stashesFound += 1;
        state.money += stash.value;
        showBanner(`STASH FOUND  +$${stash.value}  (${state.stashesFound}/8)`, 3);
        save();
        return EV_STASH;
      }
    }
    let best = null;
    let bestDist = 4.5;
    for (const car of state.cars) {
      if (car.kind === 'cop') continue;
      const d = dist2(state.player.x, state.player.z, car.x, car.z);
      if (d < bestDist) {
        best = car;
        bestDist = d;
      }
    }
    if (best) {
      enterCar(best);
      return 0;
    }
    return 0;
  }

  /** F: swing at the nearest pedestrian in front of the player. */
  function punch() {
    if (!state.player.onFoot) return 0;
    const fx = Math.sin(state.player.yaw);
    const fz = Math.cos(state.player.yaw);
    let target = null;
    let targetDist = 3.0;
    for (const ped of state.peds) {
      if (ped.mode === 'down') continue;
      const dx = ped.x - state.player.x;
      const dz = ped.z - state.player.z;
      const d = Math.hypot(dx, dz);
      if (d < targetDist && d > 0.01 && (dx / d) * fx + (dz / d) * fz > 0.1) {
        target = ped;
        targetDist = d;
      }
    }
    if (target) {
      target.mode = 'down';
      target.modeTimer = PEDS.downSeconds;
      addWanted(1);
      showBanner('That will leave a mark', 2);
      return EV_PUNCH;
    }
    return 0;
  }

  /** H: two-tone horn; pedestrians ahead scatter. */
  function horn() {
    if (state.player.onFoot || !state.player.car) return 0;
    const car = state.player.car;
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    let scattered = false;
    for (const ped of state.peds) {
      if (ped.mode === 'down') continue;
      const dx = ped.x - car.x;
      const dz = ped.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < 14 && d > 0.01 && (dx / d) * fx + (dz / d) * fz > 0) {
        ped.mode = 'flee';
        ped.modeTimer = 3;
        ped.fleeX = car.x;
        ped.fleeZ = car.z;
        scattered = true;
      }
    }
    return scattered ? EV_HORN : EV_HORN;
  }

  function speedKmh() {
    const car = state.player.car;
    return car ? Math.round(Math.abs(car.speed) * 3.6) : 0;
  }

  function respawn() {
    state.money = Math.max(0, state.money - BUST_FINE);
    state.wanted = 0;
    state.health = 100;
    state.busted = false;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.x = SAFEHOUSE.x + 8;
    state.player.z = SAFEHOUSE.z;
    state.player.yaw = Math.PI / 2;
    state.cars = state.cars.filter((c) => c.kind !== 'cop');
    state.officers = [];
    showBanner(`Busted — $${BUST_FINE} fine. The safehouse again.`, 3.5);
    save();
  }

  function collideWithCity(x, z, radius) {
    let px = x;
    let pz = z;
    for (const box of colliders) {
      const push = circleBoxPush(px, pz, radius, box);
      if (push) {
        px += push.x;
        pz += push.z;
      }
    }
    return { x: clamp(px, WORLD.minX + 2, WORLD.maxX - 2), z: clamp(pz, WORLD.minZ + 2, WORLD.maxZ - 4) };
  }

  function stepPlayer(dt, input, camYaw) {
    const player = state.player;
    if (player.onFoot) {
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      const rx = Math.cos(camYaw);
      const rz = -Math.sin(camYaw);
      let mx = fx * input.forward + rx * input.strafe;
      let mz = fz * input.forward + rz * input.strafe;
      const len = Math.hypot(mx, mz);
      if (len > 0.01) {
        mx /= Math.max(1, len);
        mz /= Math.max(1, len);
        const speed = input.run ? WALK.runSpeed : WALK.speed;
        const next = collideWithCity(player.x + mx * speed * dt, player.z + mz * speed * dt, WALK.radius);
        player.x = next.x;
        player.z = next.z;
        player.yaw = Math.atan2(mx, mz);
      }
      for (const car of state.cars) {
        const d = dist2(player.x, player.z, car.x, car.z);
        const min = CAR.radius + WALK.radius;
        if (d < min && d > 0.01) {
          player.x += ((player.x - car.x) / d) * (min - d);
          player.z += ((player.z - car.z) / d) * (min - d);
        }
      }
      return 0;
    }
    const car = player.car;
    if (!car) {
      player.onFoot = true;
      return 0;
    }
    const top = CAR.topSpeed * (1 - CAR.damageLoss * car.dmg);
    if (input.forward > 0) {
      car.speed += (top - car.speed) * Math.min(1, dt * CAR.accelRate);
    } else if (input.forward < 0) {
      if (car.speed > 0.5) car.speed = Math.max(0, car.speed - CAR.brake * dt);
      else car.speed += (-CAR.reverseSpeed - car.speed) * Math.min(1, dt * 1.6);
    } else if (input.brake) {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.brake * dt);
    } else {
      car.speed -= car.speed * 0.45 * dt;
      if (Math.abs(car.speed) < 0.15) car.speed = 0;
    }
    car.yaw += input.strafe * CAR.steerRate * dt * clamp(car.speed / 6, -1, 1);
    const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
    const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
    const resolved = collideWithCity(nx, nz, CAR.radius);
    let events = 0;
    if ((resolved.x !== nx || resolved.z !== nz) && Math.abs(car.speed) > 8) {
      car.dmg = Math.min(1, car.dmg + 0.06 + Math.abs(car.speed) * 0.004);
      state.lastHitAt = state.elapsed;
      state.health = Math.max(0, state.health - (Math.abs(car.speed) > 16 ? 8 : 0));
      events |= EV_CRASH;
      car.speed *= -0.25;
    } else if (resolved.x !== nx || resolved.z !== nz) {
      car.speed *= 0.5;
    }
    car.x = resolved.x;
    car.z = resolved.z;
    player.x = car.x;
    player.z = car.z;
    player.yaw = car.yaw;
    for (const other of state.cars) {
      if (other === car || other.kind === 'cop') continue;
      const d = dist2(car.x, car.z, other.x, other.z);
      if (d < CAR.radius * 2 && d > 0.01) {
        const push = (CAR.radius * 2 - d) / 2;
        const ux = (car.x - other.x) / d;
        const uz = (car.z - other.z) / d;
        car.x += ux * push;
        car.z += uz * push;
        other.x -= ux * push;
        other.z -= uz * push;
        // Nudge the car ahead up to speed instead of grinding the player
        // to a halt behind it; the dent only lands once per shunt, and a
        // shoved car hurries away for a couple of seconds instead of
        // braking straight back into the player's path.
        other.speed = Math.max(other.speed, car.speed * 0.9);
        other.shoveTimer = 2;
        car.bumpCooldown = Math.max(0, (car.bumpCooldown || 0) - dt);
        if (car.bumpCooldown <= 0) {
          car.bumpCooldown = 0.7;
          if (Math.abs(car.speed) > 12) {
            car.dmg = Math.min(1, car.dmg + 0.05);
            state.lastHitAt = state.elapsed;
            events |= EV_CRASH;
          }
          car.speed *= 0.85;
        }
      }
    }
    for (const ped of state.peds) {
      if (ped.mode === 'down') continue;
      const d = dist2(car.x, car.z, ped.x, ped.z);
      if (d < 2.2 && Math.abs(car.speed) > 3) {
        ped.mode = 'down';
        ped.modeTimer = PEDS.downSeconds;
        events |= EV_HITPED | addWanted(1);
        car.speed *= 0.6;
      }
    }
    return events;
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic' && car.kind !== 'taxi') continue;
      const desired = Math.atan2(car.targetX - car.x, car.targetZ - car.z);
      const diff = Math.abs(wrapAngle(desired - car.yaw));
      car.yaw = turnToward(car.yaw, desired, 1.6 * dt);
      let target = TRAFFIC.cruise;
      if (car.shoveTimer > 0) {
        target = 16;
        car.shoveTimer -= dt;
      } else if (diff > 0.6) {
        target = 4;
      }
      for (const other of state.cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const d = Math.hypot(dx, dz);
        if (d < 9 && d > 0.01 && (dx / d) * Math.sin(car.yaw) + (dz / d) * Math.cos(car.yaw) > 0.6) {
          target = 0;
          break;
        }
      }
      car.speed += (target - car.speed) * Math.min(1, dt * 2.5);
      car.x += Math.sin(car.yaw) * car.speed * dt;
      car.z += Math.cos(car.yaw) * car.speed * dt;
      if (dist2(car.x, car.z, car.targetX, car.targetZ) < 4) pickNextStreetTarget(car);
    }
  }

  function stepPeds(dt) {
    for (const ped of state.peds) {
      ped.bob += dt * 6;
      if (ped.mode === 'down') {
        ped.modeTimer -= dt;
        if (ped.modeTimer <= 0) ped.mode = 'walk';
        continue;
      }
      let tx = ped.targetX;
      let tz = ped.targetZ;
      let speed = ped.speed;
      if (ped.mode === 'flee') {
        ped.modeTimer -= dt;
        const away = Math.atan2(ped.x - ped.fleeX, ped.z - ped.fleeZ);
        tx = ped.x + Math.sin(away) * 10;
        tz = ped.z + Math.cos(away) * 10;
        speed = PEDS.fleeSpeed;
        if (ped.modeTimer <= 0) {
          ped.mode = 'walk';
          pickPedTarget(ped);
        }
      }
      const desired = Math.atan2(tx - ped.x, tz - ped.z);
      ped.yaw = turnToward(ped.yaw, desired, 6 * dt);
      const next = collideWithCity(
        ped.x + Math.sin(ped.yaw) * speed * dt,
        ped.z + Math.cos(ped.yaw) * speed * dt,
        0.5,
      );
      ped.x = next.x;
      ped.z = next.z;
      if (ped.mode === 'walk' && dist2(ped.x, ped.z, ped.targetX, ped.targetZ) < 1.5) pickPedTarget(ped);
    }
  }

  function stepCops(dt) {
    let events = 0;
    for (const cop of state.cars) {
      if (cop.kind !== 'cop') continue;
      cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);
      const player = state.player;
      const d = dist2(cop.x, cop.z, player.x, player.z);
      const desired = Math.atan2(player.x - cop.x, player.z - cop.z);
      cop.yaw = turnToward(cop.yaw, desired, 2.2 * dt);
      const target = d > 30 ? COPS.cruise : d > 8 ? 10 : 7;
      cop.speed += (target - cop.speed) * Math.min(1, dt * 2);
      const nx = cop.x + Math.sin(cop.yaw) * cop.speed * dt;
      const nz = cop.z + Math.cos(cop.yaw) * cop.speed * dt;
      const resolved = collideWithCity(nx, nz, CAR.radius);
      if (resolved.x !== nx || resolved.z !== nz) cop.speed *= 0.5;
      cop.x = resolved.x;
      cop.z = resolved.z;
      if (d < 3.4 && cop.ramCooldown <= 0) {
        cop.ramCooldown = 1.5;
        cop.speed *= 0.4;
        if (player.onFoot) {
          state.health = Math.max(0, state.health - 12);
          state.lastHitAt = state.elapsed;
          events |= EV_CRASH;
        } else if (player.car) {
          player.car.dmg = Math.min(1, player.car.dmg + COPS.ramDamage);
          player.car.speed *= 0.55;
          state.lastHitAt = state.elapsed;
          events |= EV_CRASH;
        }
      }
    }
    return events;
  }

  function stepOfficers(dt) {
    const player = state.player;
    for (const officer of state.officers) {
      officer.bob += dt * 8;
      const d = dist2(officer.x, officer.z, player.x, player.z);
      if (player.onFoot && d < 1.6) {
        officer.grab += dt;
        if (officer.grab >= OFFICERS.grabSeconds) {
          state.health = 0;
          officer.grab = 0;
        }
      } else {
        officer.grab = 0;
      }
      if (d > 2) {
        const desired = Math.atan2(player.x - officer.x, player.z - officer.z);
        officer.yaw = turnToward(officer.yaw, desired, 6 * dt);
        const next = collideWithCity(
          officer.x + Math.sin(officer.yaw) * OFFICERS.runSpeed * dt,
          officer.z + Math.cos(officer.yaw) * OFFICERS.runSpeed * dt,
          0.5,
        );
        officer.x = next.x;
        officer.z = next.z;
      }
    }
  }

  function maintainPolice() {
    const wantedCops = state.wanted > 0 ? Math.min(state.wanted + 1, COPS.maxCruisers) : 0;
    const cops = state.cars.filter((c) => c.kind === 'cop');
    while (cops.length < wantedCops) {
      cops.push(spawnCop());
    }
    while (cops.length > wantedCops) {
      const gone = cops.pop();
      state.cars = state.cars.filter((c) => c !== gone);
    }
    const wantedOfficers = state.wanted >= 2 ? Math.min(state.wanted - 1, 3) : 0;
    while (state.officers.length < wantedOfficers) spawnOfficer();
    while (state.officers.length > wantedOfficers) state.officers.pop();
  }

  function completeMission(index) {
    const mission = MISSIONS[index];
    state.money += mission.reward;
    showBanner(`MISSION COMPLETE  +$${mission.reward}`, 3.5);
    state.missionIndex = index + 1;
    state.missionStage = 0;
    if (state.missionIndex < MISSIONS.length) {
      const next = MISSIONS[state.missionIndex];
      state.missionTimer = next.timeLimit || MISSIONS[1].timeLimit;
      state.objective = state.missionIndex === 1 ? { x: PIER.x, z: PIER.z } : { x: SAFEHOUSE.x, z: SAFEHOUSE.z };
    } else {
      state.objective = null;
    }
    save();
  }

  function stepMissions(dt) {
    if (state.storyDone) return 0;
    let events = 0;
    const index = state.missionIndex;
    if (index === 0) {
      if (state.missionStage === 0) {
        if (!state.player.onFoot) {
          state.missionStage = 1;
          state.objective = { x: MARINA.x, z: MARINA.z };
        }
      } else if (dist2(state.player.x, state.player.z, MARINA.x, MARINA.z) < MARKER_RADIUS) {
        completeMission(0);
        state.dialogue = DIALOGUE.marina;
        events |= EV_MISSION;
      }
    } else if (index === 1) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 10 && state.missionTimer > 0) {
        const whole = Math.ceil(state.missionTimer);
        if (whole !== state.lastTickSecond) {
          state.lastTickSecond = whole;
          events |= EV_TICK;
        }
      }
      if (state.missionTimer <= 0) {
        state.missionTimer = MISSIONS[1].timeLimit;
        state.lastTickSecond = -1;
        showBanner('Out of time — run it again', 3);
      } else if (dist2(state.player.x, state.player.z, PIER.x, PIER.z) < MARKER_RADIUS) {
        completeMission(1);
        state.dialogue = DIALOGUE.setup;
        state.wanted = 3;
        state.crimeTimer = 0;
        showBanner('Setup! The PD is on you — lose them!', 3.5);
        events |= EV_MISSION | EV_WANTED;
      }
    } else if (index === 2) {
      if (state.missionStage === 0) {
        if (state.wanted === 0) {
          state.missionStage = 1;
          state.objective = { x: SAFEHOUSE.x, z: SAFEHOUSE.z };
        }
      } else if (dist2(state.player.x, state.player.z, SAFEHOUSE.x, SAFEHOUSE.z) < MARKER_RADIUS) {
        // Flag the story done before the payout saves, so a save written
        // here never claims the last job is still open.
        state.storyDone = true;
        completeMission(2);
        state.dialogue = DIALOGUE.done;
        events |= EV_MISSION | EV_STORY;
      }
    }
    return events;
  }

  function stepPrompt() {
    const player = state.player;
    if (!player.onFoot) {
      state.prompt = state.repairing ? 'Repairing…' : '';
      return;
    }
    let stash = null;
    let stashDist = 3.2;
    for (const s of state.stashes) {
      if (s.found) continue;
      const d = dist2(player.x, player.z, s.x, s.z);
      if (d < stashDist) {
        stash = s;
        stashDist = d;
      }
    }
    if (stash) {
      state.prompt = `E — Grab the stash ★ $${stash.value}`;
      return;
    }
    let car = null;
    let carDist = 4.5;
    for (const c of state.cars) {
      if (c.kind === 'cop') continue;
      const d = dist2(player.x, player.z, c.x, c.z);
      if (d < carDist) {
        car = c;
        carDist = d;
      }
    }
    if (!car) {
      state.prompt = '';
      return;
    }
    state.prompt = car.kind === 'parked' ? 'E — Get in' : 'E — Steal this car ★';
  }

  function step(dt, input, camera, time) {
    let events = 0;
    state.elapsed += dt;
    if (state.bannerTimer > 0) {
      state.bannerTimer -= dt;
      if (state.bannerTimer <= 0) state.banner = '';
    }
    events |= stepPlayer(dt, input, camera ? camera.camYaw || 0 : 0);
    stepTraffic(dt);
    stepPeds(dt);
    events |= stepCops(dt);
    stepOfficers(dt);
    state.crimeTimer += dt;
    if (state.crimeTimer > WANTED_DECAY_SECONDS && state.wanted > 0) {
      state.wanted -= 1;
      state.crimeTimer = 0;
    }
    maintainPolice();
    events |= stepMissions(dt);
    // Safehouse repair: parked in the green zone, the damage melts away.
    const car = state.player.car;
    if (!state.player.onFoot && car && car.dmg > 0 && dist2(car.x, car.z, SAFEHOUSE.x, SAFEHOUSE.z) < CAR.repairRadius) {
      state.repairing = true;
      car.dmg = Math.max(0, car.dmg - CAR.repairRate * dt);
      if (car.dmg === 0) {
        state.repairing = false;
        showBanner('Car repaired — on the house', 2.5);
        events |= EV_REPAIRED;
      }
    } else {
      state.repairing = false;
    }
    stepPrompt();
    if (state.elapsed - state.lastHitAt > 4 && state.health > 0 && state.health < 100) {
      state.health = Math.min(100, state.health + 1.5 * dt);
    }
    if (state.health <= 0 && !state.busted) {
      state.busted = true;
      events |= EV_BUSTED;
    }
    return events;
  }

  const debug = {
    placePlayer(x, z, yaw) {
      state.player.onFoot = true;
      state.player.car = null;
      state.player.x = x;
      state.player.z = z;
      state.player.yaw = yaw || 0;
    },
    placeInCar(x, z, yaw) {
      let car = state.player.car;
      if (!car) {
        let best = null;
        let bestDist = Infinity;
        for (const c of state.cars) {
          if (c.kind === 'cop') continue;
          const d = dist2(state.player.x, state.player.z, c.x, c.z);
          if (d < bestDist) {
            best = c;
            bestDist = d;
          }
        }
        car = best || makeCar('parked', x, z, yaw || 0);
        if (!state.cars.includes(car)) state.cars.push(car);
      }
      car.x = x;
      car.z = z;
      car.yaw = yaw || 0;
      car.speed = 0;
      state.player.car = car;
      state.player.onFoot = false;
      state.player.x = x;
      state.player.z = z;
      state.player.yaw = yaw || 0;
    },
    setWanted(value) {
      state.wanted = clamp(value, 0, MAX_WANTED);
      state.crimeTimer = 0;
    },
    setMission(index) {
      state.missionIndex = clamp(index, 0, MISSIONS.length - 1);
      state.missionStage = 0;
      state.missionTimer = MISSIONS[state.missionIndex].timeLimit || MISSIONS[1].timeLimit;
      state.objective =
        state.missionIndex === 0 ? { x: MARINA.x, z: MARINA.z }
        : state.missionIndex === 1 ? { x: PIER.x, z: PIER.z }
        : { x: SAFEHOUSE.x, z: SAFEHOUSE.z };
    },
    spawnCops(count) {
      for (let i = 0; i < count; i += 1) spawnCop();
    },
  };

  reset();
  return { state, layout, reset, step, interact, punch, horn, speedKmh, respawn, save, load, debug };
}

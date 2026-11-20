// Sunset Heat — the rules, with no drawing and no browser in them.
//
// The player on foot and in cars, traffic and pedestrians, the wanted
// level and the police who answer it, the three story jobs, the hidden
// stashes, car damage and the safehouse repair, the bust and the save.
// step() advances one fixed step and returns what happened as bit flags,
// so the caller can play sounds and show banners without the world
// knowing about screens or speakers.
//
// Coordinates: x east, z north toward the beach. A heading of 0 faces
// north (+z); forward is (sin(yaw), cos(yaw)).

import {
  CROWD, DRIVING, HEAT, HIDDEN_CASH, ISLAND, JOBS, LINES, ON_FOOT, PLACES,
  POLICE, SAVE_KEY, SPAWN, START_MONEY, STREETS,
} from './config.js';
import { generateLayout } from './city.js';

/** What one step can report, as bit flags. */
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

/** Paint jobs the traffic and parked cars wear. */
const CAR_PAINT = [0xd21f2b, 0x2b6fd2, 0xe8e4da, 0x222226, 0x3f7a4a, 0xc96a2b, 0x7a4a9c, 0x9c2b2b];
/** Shirt colours for pedestrians. */
const SHIRT_COLORS = [0x3a6fd2, 0xd23a5e, 0x3aa655, 0xd2a13a, 0x7a5ad2, 0xd2d2d2, 0x2b2b2b, 0xc96a2b];
/** Where the parked cars sit, in a fixed order. */
const PARKED_SPOTS = [
  [3, 14, 0], [-8, 40, 0], [14, -30, Math.PI / 2], [-40, 8, Math.PI / 2],
  [60, -8, 0], [-70, -60, Math.PI], [90, 60, Math.PI / 2], [-120, -30, 0],
];

/** Clamp `value` into [min, max]. */
function clampTo(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Wrap an angle into (-PI, PI]. */
function angleWrap(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/** Turn `current` toward `target` by at most `maxStep`. */
function steerToward(current, target, maxStep) {
  return current + clampTo(angleWrap(target - current), -maxStep, maxStep);
}

/** Distance between two points on the ground plane. */
function dist2d(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

/** Ease `current` toward `target` at `rate` per second, frame-safe. */
function approach(current, target, rate, dt) {
  return current + (target - current) * Math.min(1, rate * dt);
}

/** Push a circle out of an axis-aligned box; null when clear. */
function pushOutOfBox(x, z, radius, box) {
  const cx = clampTo(x, box.minX, box.maxX);
  const cz = clampTo(z, box.minZ, box.maxZ);
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

/** The street line nearest to a coordinate, inside the grid. */
function nearestRoad(value) {
  return clampTo(Math.round(value / STREETS.every) * STREETS.every, -240, 240);
}

/** A damaged car's top speed: the wreck penalty eats the top end. */
function topSpeedFor(car) {
  return DRIVING.topSpeed * (1 - DRIVING.damageLoss * car.dmg);
}

/** A fresh game state: money, health, jobs, stashes, all at their start. */
function freshState() {
  return {
    player: { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw, onFoot: true, car: null },
    cars: [],
    peds: [],
    officers: [],
    stashes: HIDDEN_CASH.map((s) => ({ x: s.x, z: s.z, value: s.value, found: false })),
    stashesFound: 0,
    money: START_MONEY,
    health: 100,
    wanted: 0,
    missionIndex: 0,
    missionStage: 0,
    missionTimer: JOBS[1].timeLimit,
    storyDone: false,
    busted: false,
    prompt: '',
    repairing: false,
    banner: '',
    bannerTimer: 0,
    dialogue: LINES.intro,
    objective: { x: PLACES.marina.x, z: PLACES.marina.z },
    elapsed: 0,
    lastTickSecond: -1,
    crimeTimer: 0,
    lastHitAt: -99,
  };
}

/**
 * Build the world from a seeded random source: the city layout, the
 * opening state, and every rule. The returned object is the whole game
 * minus drawing and input.
 */
export function createWorld(random) {
  const layout = generateLayout(random);
  const colliders = [];
  for (const b of layout.buildings) {
    colliders.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
  }
  colliders.push({ minX: PLACES.safehouse.x - 5.5, maxX: PLACES.safehouse.x + 5.5, minZ: PLACES.safehouse.z - 4, maxZ: PLACES.safehouse.z + 4 });
  colliders.push({ minX: PLACES.marina.x - 3, maxX: PLACES.marina.x + 3, minZ: PLACES.marina.z - 2.5, maxZ: PLACES.marina.z + 2.5 });

  let carId = 0;
  const state = freshState();

  function showBanner(text, seconds) {
    state.banner = text;
    state.bannerTimer = seconds || 3;
  }

  /** The save payload: everything a fresh boot restores. */
  function serialize() {
    return {
      v: 1,
      money: state.money,
      missionIndex: state.missionIndex,
      missionStage: state.missionStage,
      storyDone: state.storyDone,
      stashesFound: state.stashesFound,
      found: state.stashes.map((s) => (s.found ? 1 : 0)),
      health: state.health,
    };
  }

  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
    } catch {
      // Storage can be off: progress then lasts this visit only.
    }
  }

  /** Where the next job points, for a given job index and story state. */
  function objectiveFor(index, done) {
    if (done || index >= JOBS.length) return null;
    if (index === 0) return { x: PLACES.marina.x, z: PLACES.marina.z };
    if (index === 1) return { x: PLACES.pier.x, z: PLACES.pier.z };
    return { x: PLACES.safehouse.x, z: PLACES.safehouse.z };
  }

  function applySave(data) {
    state.money = data.money ?? START_MONEY;
    state.missionIndex = clampTo(data.missionIndex ?? 0, 0, JOBS.length);
    state.missionStage = data.missionStage ?? 0;
    state.storyDone = !!data.storyDone;
    state.stashesFound = data.stashesFound ?? 0;
    state.objective = objectiveFor(state.missionIndex, state.storyDone);
    if (Array.isArray(data.found)) {
      data.found.forEach((f, i) => {
        if (f && state.stashes[i]) state.stashes[i].found = true;
      });
    }
    state.health = data.health ?? 100;
    state.dialogue = state.missionIndex === 0 ? LINES.intro : state.missionIndex === 1 ? LINES.marina : LINES.setup;
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return;
      applySave(data);
    } catch {
      // A corrupt save is ignored, not fatal.
    }
  }

  /** A random intersection on the street grid. */
  function randomCrossing() {
    return {
      x: random.int(-4, 5) * STREETS.every,
      z: random.int(-4, 5) * STREETS.every,
    };
  }

  function makeCar(kind, x, z, yaw) {
    const taxi = kind === 'traffic' && random.chance(CROWD.taxiChance);
    const paint = kind === 'cop' ? 0x14161c : taxi ? 0xf2c200 : random.pick(CAR_PAINT);
    return {
      id: carId++, kind: taxi ? 'taxi' : kind, x, z, yaw,
      speed: 0, dmg: 0, color: paint, targetX: x, targetZ: z,
      axis: random.chance(0.5) ? 'x' : 'z',
      dir: random.chance(0.5) ? 1 : -1,
      ramCooldown: 0,
    };
  }

  /** Pick the next intersection a traffic car drives toward. */
  function pickNextCrossing(car) {
    const cx = nearestRoad(car.x);
    const cz = nearestRoad(car.z);
    if (random.chance(CROWD.turnChance)) {
      car.axis = car.axis === 'x' ? 'z' : 'x';
      car.dir = random.chance(0.5) ? 1 : -1;
    }
    const along = car.axis === 'x' ? cx : cz;
    let next = along + car.dir * STREETS.every;
    if (next > 240 || next < -240) {
      car.dir *= -1;
      next = along + car.dir * STREETS.every;
    }
    if (car.axis === 'x') {
      car.targetX = next;
      car.targetZ = cz;
    } else {
      car.targetX = cx;
      car.targetZ = next;
    }
  }

  function spawnTrafficCar() {
    const at = randomCrossing();
    const car = makeCar('traffic', at.x, at.z, random.chance(0.5) ? 0 : Math.PI / 2);
    pickNextCrossing(car);
    return car;
  }

  /** Pick the next corner a pedestrian wanders toward. */
  function pickPedCorner(ped) {
    const at = randomCrossing();
    ped.targetX = at.x + random.range(-9, 9);
    ped.targetZ = at.z + random.range(-9, 9);
  }

  function spawnPed() {
    const at = randomCrossing();
    const ped = {
      x: at.x + random.range(-8, 8),
      z: at.z + random.range(-8, 8),
      yaw: random.range(0, Math.PI * 2),
      speed: random.range(CROWD.pedWalkMin, CROWD.pedWalkMax),
      mode: 'walk', modeTimer: 0,
      targetX: at.x, targetZ: at.z,
      fleeX: 0, fleeZ: 0,
      shirt: random.pick(SHIRT_COLORS),
      bob: random.range(0, Math.PI * 2),
    };
    pickPedCorner(ped);
    return ped;
  }

  function spawnCop() {
    const angle = random.range(0, Math.PI * 2);
    const x = nearestRoad(state.player.x + Math.cos(angle) * POLICE.cruiserSpawn);
    const z = nearestRoad(state.player.z + Math.sin(angle) * POLICE.cruiserSpawn);
    const cop = makeCar('cop', x, z, 0);
    cop.targetX = state.player.x;
    cop.targetZ = state.player.z;
    state.cars.push(cop);
    return cop;
  }

  function spawnOfficer() {
    const angle = random.range(0, Math.PI * 2);
    state.officers.push({
      x: clampTo(state.player.x + Math.cos(angle) * POLICE.officerSpawn, -260, 260),
      z: clampTo(state.player.z + Math.sin(angle) * POLICE.officerSpawn, -260, 260),
      yaw: 0, grab: 0, shirt: 0x1c2f6b,
      bob: random.range(0, Math.PI * 2),
    });
  }

  /** Raise the wanted level; returns EV_WANTED when a star is added. */
  function addWanted(amount) {
    const before = state.wanted;
    state.wanted = clampTo(state.wanted + amount, 0, HEAT.maxStars);
    state.crimeTimer = 0;
    return state.wanted > before ? EV_WANTED : 0;
  }

  /** The nearest unclaimed stash within `range` of a point, or null. */
  function nearestStash(x, z, range) {
    let best = null;
    let bestDist = range;
    for (const s of state.stashes) {
      if (s.found) continue;
      const d = dist2d(x, z, s.x, s.z);
      if (d < bestDist) {
        best = s;
        bestDist = d;
      }
    }
    return best;
  }

  /** The nearest car within `range` of a point, cruisers excluded. */
  function nearestCar(x, z, range) {
    let best = null;
    let bestDist = range;
    for (const c of state.cars) {
      if (c.kind === 'cop') continue;
      const d = dist2d(x, z, c.x, c.z);
      if (d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  }

  function reset() {
    Object.assign(state, freshState());
    for (let i = 0; i < CROWD.parkedCars; i += 1) {
      const spot = PARKED_SPOTS[i % PARKED_SPOTS.length];
      state.cars.push(makeCar('parked', spot[0], spot[1], spot[2]));
    }
    for (let i = 0; i < CROWD.trafficCars; i += 1) state.cars.push(spawnTrafficCar());
    for (let i = 0; i < CROWD.peds; i += 1) state.peds.push(spawnPed());
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
    // Step out on the car's right side.
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
    const stash = nearestStash(state.player.x, state.player.z, 3.2);
    if (stash) {
      stash.found = true;
      state.stashesFound += 1;
      state.money += stash.value;
      showBanner(`STASH FOUND  +$${stash.value}  (${state.stashesFound}/8)`, 3);
      save();
      return EV_STASH;
    }
    const car = nearestCar(state.player.x, state.player.z, 4.5);
    if (car) {
      enterCar(car);
      return 0;
    }
    return 0;
  }

  /** The pedestrian in front of the player inside punch reach, or null. */
  function punchTarget() {
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
    return target;
  }

  /** F: swing at the nearest pedestrian in front of the player. */
  function punch() {
    if (!state.player.onFoot) return 0;
    const target = punchTarget();
    if (!target) return 0;
    target.mode = 'down';
    target.modeTimer = CROWD.pedDownSeconds;
    addWanted(1);
    showBanner('That will leave a mark', 2);
    return EV_PUNCH;
  }

  /** H: two-tone horn; pedestrians ahead scatter. */
  function horn() {
    if (state.player.onFoot || !state.player.car) return 0;
    const car = state.player.car;
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
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
      }
    }
    return EV_HORN;
  }

  function speedKmh() {
    const car = state.player.car;
    return car ? Math.round(Math.abs(car.speed) * 3.6) : 0;
  }

  /** The bust: fine, heat gone, wake up at the safehouse on foot. */
  function respawn() {
    state.money = Math.max(0, state.money - HEAT.bustFine);
    state.wanted = 0;
    state.health = 100;
    state.busted = false;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.x = PLACES.safehouse.x + 8;
    state.player.z = PLACES.safehouse.z;
    state.player.yaw = Math.PI / 2;
    state.cars = state.cars.filter((c) => c.kind !== 'cop');
    state.officers = [];
    showBanner(`Busted — $${HEAT.bustFine} fine. The safehouse again.`, 3.5);
    save();
  }

  /** Move a point out of every building and clamp it to the island. */
  function moveWithCollision(x, z, radius) {
    let px = x;
    let pz = z;
    let hit = false;
    for (const box of colliders) {
      const push = pushOutOfBox(px, pz, radius, box);
      if (push) {
        px += push.x;
        pz += push.z;
        hit = true;
      }
    }
    // The island edge is a wall too: being clamped back counts as a hit,
    // the same way a building push does.
    const cx = clampTo(px, ISLAND.west + 2, ISLAND.east - 2);
    const cz = clampTo(pz, ISLAND.south + 2, ISLAND.north - 4);
    if (cx !== px || cz !== pz) hit = true;
    return { x: cx, z: cz, hit };
  }

  /** On foot: walk where the camera points, and don't clip through cars. */
  function walkPlayer(dt, input, camYaw) {
    const player = state.player;
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
      const speed = input.run ? ON_FOOT.run : ON_FOOT.walk;
      const next = moveWithCollision(player.x + mx * speed * dt, player.z + mz * speed * dt, ON_FOOT.radius);
      player.x = next.x;
      player.z = next.z;
      player.yaw = Math.atan2(mx, mz);
    }
    for (const car of state.cars) {
      const d = dist2d(player.x, player.z, car.x, car.z);
      const min = DRIVING.radius + ON_FOOT.radius;
      if (d < min && d > 0.01) {
        player.x += ((player.x - car.x) / d) * (min - d);
        player.z += ((player.z - car.z) / d) * (min - d);
      }
    }
  }

  /** Shove the cars the player's car overlaps, and dent on a hard shunt. */
  function shuntCars(car, dt) {
    let events = 0;
    for (const other of state.cars) {
      if (other === car || other.kind === 'cop') continue;
      const d = dist2d(car.x, car.z, other.x, other.z);
      if (d >= DRIVING.radius * 2 || d <= 0.01) continue;
      const push = (DRIVING.radius * 2 - d) / 2;
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
    return events;
  }

  /** Run down any pedestrian the car touches at speed. */
  function hitPedestrians(car) {
    let events = 0;
    for (const ped of state.peds) {
      if (ped.mode === 'down') continue;
      const d = dist2d(car.x, car.z, ped.x, ped.z);
      if (d < 2.2 && Math.abs(car.speed) > 3) {
        ped.mode = 'down';
        ped.modeTimer = CROWD.pedDownSeconds;
        events |= EV_HITPED | addWanted(1);
        car.speed *= 0.6;
      }
    }
    return events;
  }

  /** Driving: throttle, brake, reverse, steer, and the crash dent. */
  function driveCar(car, input, dt) {
    const top = topSpeedFor(car);
    if (input.forward > 0) {
      car.speed = approach(car.speed, top, DRIVING.accelRate, dt);
    } else if (input.forward < 0) {
      if (car.speed > 0.5) car.speed = Math.max(0, car.speed - DRIVING.brake * dt);
      else car.speed = approach(car.speed, -DRIVING.reverseSpeed, 1.6, dt);
    } else if (input.brake) {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), DRIVING.brake * dt);
    } else {
      car.speed -= car.speed * 0.45 * dt;
      if (Math.abs(car.speed) < 0.15) car.speed = 0;
    }
    car.yaw += input.strafe * DRIVING.steerRate * dt * clampTo(car.speed / 6, -1, 1);
    const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
    const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
    const moved = moveWithCollision(nx, nz, DRIVING.radius);
    let events = 0;
    if (moved.hit && Math.abs(car.speed) > 8) {
      car.dmg = Math.min(1, car.dmg + 0.06 + Math.abs(car.speed) * 0.004);
      state.lastHitAt = state.elapsed;
      state.health = Math.max(0, state.health - (Math.abs(car.speed) > 16 ? 8 : 0));
      events |= EV_CRASH;
      car.speed *= -0.25;
    } else if (moved.hit) {
      car.speed *= 0.5;
    }
    car.x = moved.x;
    car.z = moved.z;
    return events;
  }

  function stepPlayer(dt, input, camYaw) {
    const player = state.player;
    if (player.onFoot) {
      walkPlayer(dt, input, camYaw);
      return 0;
    }
    const car = player.car;
    if (!car) {
      player.onFoot = true;
      return 0;
    }
    // Drive first, then pin the player to the car before the shunt and
    // pedestrian passes, so the police read the same spot the car is on.
    let events = driveCar(car, input, dt);
    player.x = car.x;
    player.z = car.z;
    player.yaw = car.yaw;
    events |= shuntCars(car, dt);
    events |= hitPedestrians(car);
    return events;
  }

  /** One traffic car: steer for its crossing, mind the car ahead. */
  function driveTrafficCar(car, dt) {
    const desired = Math.atan2(car.targetX - car.x, car.targetZ - car.z);
    const diff = Math.abs(angleWrap(desired - car.yaw));
    car.yaw = steerToward(car.yaw, desired, 1.6 * dt);
    let target = CROWD.trafficCruise;
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
    car.speed = approach(car.speed, target, 2.5, dt);
    car.x += Math.sin(car.yaw) * car.speed * dt;
    car.z += Math.cos(car.yaw) * car.speed * dt;
    if (dist2d(car.x, car.z, car.targetX, car.targetZ) < 4) pickNextCrossing(car);
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic' && car.kind !== 'taxi') continue;
      driveTrafficCar(car, dt);
    }
  }

  /** One pedestrian: walk, flee, or lie where the punch left them. */
  function updatePed(ped, dt) {
    ped.bob += dt * 6;
    if (ped.mode === 'down') {
      ped.modeTimer -= dt;
      if (ped.modeTimer <= 0) ped.mode = 'walk';
      return;
    }
    let tx = ped.targetX;
    let tz = ped.targetZ;
    let speed = ped.speed;
    if (ped.mode === 'flee') {
      ped.modeTimer -= dt;
      const away = Math.atan2(ped.x - ped.fleeX, ped.z - ped.fleeZ);
      tx = ped.x + Math.sin(away) * 10;
      tz = ped.z + Math.cos(away) * 10;
      speed = CROWD.pedFlee;
      if (ped.modeTimer <= 0) {
        ped.mode = 'walk';
        pickPedCorner(ped);
      }
    }
    const desired = Math.atan2(tx - ped.x, tz - ped.z);
    ped.yaw = steerToward(ped.yaw, desired, 6 * dt);
    const next = moveWithCollision(
      ped.x + Math.sin(ped.yaw) * speed * dt,
      ped.z + Math.cos(ped.yaw) * speed * dt,
      0.5,
    );
    ped.x = next.x;
    ped.z = next.z;
    if (ped.mode === 'walk' && dist2d(ped.x, ped.z, ped.targetX, ped.targetZ) < 1.5) pickPedCorner(ped);
  }

  function stepPeds(dt) {
    for (const ped of state.peds) updatePed(ped, dt);
  }

  /** One cruiser: close on the player and ram when it gets there. */
  function chasePlayer(cop, dt) {
    cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);
    const player = state.player;
    const d = dist2d(cop.x, cop.z, player.x, player.z);
    const desired = Math.atan2(player.x - cop.x, player.z - cop.z);
    cop.yaw = steerToward(cop.yaw, desired, 2.2 * dt);
    const target = d > 30 ? POLICE.cruiserSpeed : d > 8 ? 10 : 7;
    cop.speed = approach(cop.speed, target, 2, dt);
    const nx = cop.x + Math.sin(cop.yaw) * cop.speed * dt;
    const nz = cop.z + Math.cos(cop.yaw) * cop.speed * dt;
    const moved = moveWithCollision(nx, nz, DRIVING.radius);
    if (moved.hit) cop.speed *= 0.5;
    cop.x = moved.x;
    cop.z = moved.z;
    if (d < 3.4 && cop.ramCooldown <= 0) {
      cop.ramCooldown = 1.5;
      cop.speed *= 0.4;
      if (player.onFoot) {
        state.health = Math.max(0, state.health - 12);
        state.lastHitAt = state.elapsed;
        return EV_CRASH;
      }
      if (player.car) {
        player.car.dmg = Math.min(1, player.car.dmg + POLICE.ramDamage);
        player.car.speed *= 0.55;
        state.lastHitAt = state.elapsed;
        return EV_CRASH;
      }
    }
    return 0;
  }

  function stepCops(dt) {
    let events = 0;
    for (const cop of state.cars) {
      if (cop.kind !== 'cop') continue;
      events |= chasePlayer(cop, dt);
    }
    return events;
  }

  /** One officer: run the player down and hold them till the bust. */
  function chaseOnFoot(officer, dt) {
    const player = state.player;
    officer.bob += dt * 8;
    const d = dist2d(officer.x, officer.z, player.x, player.z);
    if (player.onFoot && d < 1.6) {
      officer.grab += dt;
      if (officer.grab >= POLICE.grabSeconds) {
        state.health = 0;
        officer.grab = 0;
      }
    } else {
      officer.grab = 0;
    }
    if (d > 2) {
      const desired = Math.atan2(player.x - officer.x, player.z - officer.z);
      officer.yaw = steerToward(officer.yaw, desired, 6 * dt);
      const next = moveWithCollision(
        officer.x + Math.sin(officer.yaw) * POLICE.officerRun * dt,
        officer.z + Math.cos(officer.yaw) * POLICE.officerRun * dt,
        0.5,
      );
      officer.x = next.x;
      officer.z = next.z;
    }
  }

  function stepOfficers(dt) {
    for (const officer of state.officers) chaseOnFoot(officer, dt);
  }

  /** Keep the police on the street matched to the wanted level. */
  function maintainPolice() {
    const wantedCops = state.wanted > 0 ? Math.min(state.wanted + 1, POLICE.maxCruisers) : 0;
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

  /** Pay a finished job out and point at the next one. */
  function completeMission(index) {
    const job = JOBS[index];
    state.money += job.reward;
    showBanner(`MISSION COMPLETE  +$${job.reward}`, 3.5);
    state.missionIndex = index + 1;
    state.missionStage = 0;
    if (state.missionIndex < JOBS.length) {
      const next = JOBS[state.missionIndex];
      state.missionTimer = next.timeLimit || JOBS[1].timeLimit;
      state.objective = objectiveFor(state.missionIndex, false);
    } else {
      state.objective = null;
    }
    save();
  }

  /** Job 1: get wheels, then reach the marina marker. */
  function jobFirstWheels() {
    if (state.missionStage === 0) {
      if (!state.player.onFoot) {
        state.missionStage = 1;
        state.objective = { x: PLACES.marina.x, z: PLACES.marina.z };
      }
      return 0;
    }
    if (dist2d(state.player.x, state.player.z, PLACES.marina.x, PLACES.marina.z) < PLACES.markerRadius) {
      completeMission(0);
      state.dialogue = LINES.marina;
      return EV_MISSION;
    }
    return 0;
  }

  /** Job 2: the pier run on a ninety-second clock. */
  function jobSunsetRun(dt) {
    state.missionTimer -= dt;
    let events = 0;
    if (state.missionTimer <= 10 && state.missionTimer > 0) {
      const whole = Math.ceil(state.missionTimer);
      if (whole !== state.lastTickSecond) {
        state.lastTickSecond = whole;
        events |= EV_TICK;
      }
    }
    if (state.missionTimer <= 0) {
      state.missionTimer = JOBS[1].timeLimit;
      state.lastTickSecond = -1;
      showBanner('Out of time — run it again', 3);
      return events;
    }
    if (dist2d(state.player.x, state.player.z, PLACES.pier.x, PLACES.pier.z) < PLACES.markerRadius) {
      completeMission(1);
      state.dialogue = LINES.setup;
      state.wanted = 3;
      state.crimeTimer = 0;
      showBanner('Setup! The PD is on you — lose them!', 3.5);
      events |= EV_MISSION | EV_WANTED;
    }
    return events;
  }

  /** Job 3: lose the heat, then get to the safehouse. */
  function jobHeatOff() {
    if (state.missionStage === 0) {
      if (state.wanted === 0) {
        state.missionStage = 1;
        state.objective = { x: PLACES.safehouse.x, z: PLACES.safehouse.z };
      }
      return 0;
    }
    if (dist2d(state.player.x, state.player.z, PLACES.safehouse.x, PLACES.safehouse.z) < PLACES.markerRadius) {
      // Flag the story done before the payout saves, so a save written
      // here never claims the last job is still open.
      state.storyDone = true;
      completeMission(2);
      state.dialogue = LINES.done;
      return EV_MISSION | EV_STORY;
    }
    return 0;
  }

  function stepMissions(dt) {
    if (state.storyDone) return 0;
    if (state.missionIndex === 0) return jobFirstWheels();
    if (state.missionIndex === 1) return jobSunsetRun(dt);
    return jobHeatOff();
  }

  /** The one-line context prompt under the crosshair. */
  function stepPrompt() {
    const player = state.player;
    if (!player.onFoot) {
      state.prompt = state.repairing ? 'Repairing…' : '';
      return;
    }
    const stash = nearestStash(player.x, player.z, 3.2);
    if (stash) {
      state.prompt = `E — Grab the stash ★ $${stash.value}`;
      return;
    }
    const car = nearestCar(player.x, player.z, 4.5);
    if (!car) {
      state.prompt = '';
      return;
    }
    state.prompt = car.kind === 'parked' ? 'E — Get in' : 'E — Steal this car ★';
  }

  /** Safehouse repair: parked in the green zone, damage melts away. */
  function repairCar(dt) {
    const car = state.player.car;
    if (state.player.onFoot || !car || car.dmg <= 0) {
      state.repairing = false;
      return 0;
    }
    if (dist2d(car.x, car.z, PLACES.safehouse.x, PLACES.safehouse.z) >= DRIVING.repairRadius) {
      state.repairing = false;
      return 0;
    }
    state.repairing = true;
    car.dmg = Math.max(0, car.dmg - DRIVING.repairRate * dt);
    if (car.dmg === 0) {
      state.repairing = false;
      showBanner('Car repaired — on the house', 2.5);
      return EV_REPAIRED;
    }
    return 0;
  }

  /** Health creeps back after a quiet stretch; zero health is a bust. */
  function recoverHealth(dt) {
    if (state.elapsed - state.lastHitAt > 4 && state.health > 0 && state.health < 100) {
      state.health = Math.min(100, state.health + 1.5 * dt);
    }
    if (state.health <= 0 && !state.busted) {
      state.busted = true;
      return EV_BUSTED;
    }
    return 0;
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
    if (state.crimeTimer > HEAT.decaySeconds && state.wanted > 0) {
      state.wanted -= 1;
      state.crimeTimer = 0;
    }
    maintainPolice();
    events |= stepMissions(dt);
    events |= repairCar(dt);
    stepPrompt();
    events |= recoverHealth(dt);
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
        car = nearestCar(state.player.x, state.player.z, Infinity) || makeCar('parked', x, z, yaw || 0);
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
      state.wanted = clampTo(value, 0, HEAT.maxStars);
      state.crimeTimer = 0;
    },
    setMission(index) {
      state.missionIndex = clampTo(index, 0, JOBS.length - 1);
      state.missionStage = 0;
      state.missionTimer = JOBS[state.missionIndex].timeLimit || JOBS[1].timeLimit;
      state.objective = objectiveFor(state.missionIndex, false);
    },
    spawnCops(count) {
      for (let i = 0; i < count; i += 1) spawnCop();
    },
  };

  reset();
  return { state, layout, reset, step, interact, punch, horn, speedKmh, respawn, save, load, debug };
}

// The screenshot scenes behind ?shot=cover|chase|mission|start (with
// &seed=N). Each one stages the real world — a real car, real cops, a real
// mission state — and fixes the camera, so the frame is what the game
// itself looks like and the same seed always gives the same frame. The
// main loop only paints the staged scene twice and sets __shotReady;
// nothing here plays the game forward on its own.

import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** The nearest cop cruiser, moved to an exact spot for the frame. */
function nearestCop(state) {
  let best = null;
  let bestDist = Infinity;
  for (const car of state.cars) {
    if (car.kind !== 'cop') continue;
    const d = Math.hypot(car.x - state.player.x, car.z - state.player.z);
    if (d < bestDist) {
      best = car;
      bestDist = d;
    }
  }
  return best;
}

function nearestParked(state) {
  let best = null;
  let bestDist = Infinity;
  for (const car of state.cars) {
    if (car.kind !== 'parked') continue;
    const d = Math.hypot(car.x - state.player.x, car.z - state.player.z);
    if (d < bestDist) {
      best = car;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Set `world` and the camera to the named scene and return the screen to
 * draw over it. Unknown names fall back to the title scene.
 */
export function stageShot(name, world, renderer) {
  world.reset();
  const state = world.state;
  state.money = 50;
  renderer.camYaw = 0;

  if (name === 'cover') {
    // Mission 2 at full speed: the red car running north up the beach
    // road toward the sunset, 108 km/h on the clock, 87 seconds left.
    state.missionIndex = 1;
    state.missionStage = 0;
    state.missionTimer = 87;
    state.objective = { x: 150, z: 210 };
    world.debug.placeInCar(0, 60, 0);
    const car = state.player.car;
    car.color = 0xd21f2b;
    car.speed = 30;
    // Clear the camera corridor: any other car between the lens and the
    // red car would hide it, so park the rest on the side streets.
    let lane = 0;
    for (const other of state.cars) {
      if (other === car) continue;
      other.x = lane % 2 === 0 ? -120 : 120;
      other.z = -180 + Math.floor(lane / 2) * 60;
      other.yaw = 0;
      other.speed = 0;
      lane += 1;
    }
    renderer.setShotCam([0, 5, 50], [0, 2, 90]);
    return { screen: SCREEN_PLAY };
  }

  if (name === 'chase') {
    // Mission 1, three stars, on foot with a cruiser right behind —
    // Marco's line still on screen, the city ahead.
    state.missionIndex = 0;
    state.missionStage = 0;
    state.wanted = 3;
    world.debug.placePlayer(0, 10, 0);
    world.debug.spawnCops(1);
    const cop = nearestCop(state);
    if (cop) {
      cop.x = -3.5;
      cop.z = 3.5;
      cop.yaw = 0.1;
      cop.speed = 0;
    }
    renderer.setShotCam([0, 4.5, -1], [0, 1.4, 14]);
    return { screen: SCREEN_PLAY };
  }

  if (name === 'mission') {
    // Mission 1, second stage: the player just dropped a pedestrian
    // beside the red car while a cruiser closes in from the right.
    state.missionIndex = 0;
    state.missionStage = 1;
    state.objective = { x: -150, z: 150 };
    world.debug.placePlayer(0, 0, 0.35);
    const parked = nearestParked(state);
    if (parked) {
      parked.x = 2.5;
      parked.z = 7;
      parked.yaw = 0.2;
      parked.color = 0xd21f2b;
    }
    const ped = state.peds[0];
    if (ped) {
      ped.x = 1.5;
      ped.z = 4;
      ped.mode = 'down';
      ped.modeTimer = 6;
    }
    world.debug.spawnCops(1);
    const cop = nearestCop(state);
    if (cop) {
      cop.x = 14;
      cop.z = 12;
      cop.yaw = -0.6;
      cop.speed = 0;
    }
    renderer.setShotCam([-7, 5, -9], [2, 1.2, 9]);
    return { screen: SCREEN_PLAY };
  }

  // 'start' and anything else: the title over the dusk skyline.
  renderer.setShotCam([70, 170, -170], [0, 0, 70]);
  return { screen: SCREEN_TITLE };
}

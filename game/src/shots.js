// The screenshot scenes behind ?shot=cover|chase|mission|start (with
// &seed=N). Each one stages the real world — a real car, real cops, a real
// mission state — and fixes the camera, so the frame is what the game
// itself looks like and the same seed always gives the same frame. The
// main loop only paints the staged scene twice and sets __shotReady;
// nothing here plays the game forward on its own.

import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** The nearest car of `kind` to the player, or null. */
function nearestOfKind(state, kind) {
  let best = null;
  let bestDist = Infinity;
  for (const car of state.cars) {
    if (car.kind !== kind) continue;
    const d = Math.hypot(car.x - state.player.x, car.z - state.player.z);
    if (d < bestDist) {
      best = car;
      bestDist = d;
    }
  }
  return best;
}

/** Park a car at a spot, still and facing `yaw`. */
function parkAt(car, x, z, yaw) {
  car.x = x;
  car.z = z;
  car.yaw = yaw;
  car.speed = 0;
}

/** Spread every non-cop car over the side streets, clear of the frame. */
function clearTraffic(state, spots) {
  let lane = 0;
  for (const other of state.cars) {
    if (other.kind === 'cop') continue;
    const spot = spots[lane % spots.length];
    parkAt(other, spot[0], spot[1], 0);
    lane += 1;
  }
}

/** Side-street parking spots for the cover's spare cars. */
function coverParkSpots() {
  const spots = [];
  for (const z of [-180, -120, -60, 0, 60, 120, 180]) {
    for (const x of [-120, 120]) spots.push([x, z]);
  }
  for (const z of [-180, -120, -60, 0]) {
    for (const x of [-180, 180]) spots.push([x, z]);
  }
  return spots;
}

/** The cover: mission 2 at full speed, the red car running north up the
 *  beach road toward the sunset, 108 km/h on the clock, 87 seconds left.
 *  A yellow taxi and a white car ahead give the road life; the camera
 *  sits low and close (v1/v2 looked east, where half the sky is void
 *  because the sunset band only covers the north — the northbound frame
 *  is the one with the sun and the skyline in it). */
function stageCover(world, renderer) {
  const state = world.state;
  state.missionIndex = 1;
  state.missionStage = 0;
  state.missionTimer = 87;
  state.objective = { x: 150, z: 210 };
  world.debug.placeInCar(0, 60, 0);
  const car = state.player.car;
  car.color = 0xd21f2b;
  car.speed = 30;
  // A taxi ahead in the lane and one car further on; the rest park on
  // the side streets, clear of the corridor.
  const spots = coverParkSpots();
  let placed = 0;
  let lane = 0;
  for (const other of state.cars) {
    if (other === car) continue;
    if (placed === 0) {
      other.kind = 'taxi';
      other.color = 0xf2c230;
      parkAt(other, 0, 78, 0);
      placed += 1;
    } else if (placed === 1) {
      other.color = 0xe8e4da;
      parkAt(other, 3, 96, 0);
      placed += 1;
    } else {
      const spot = spots[lane % spots.length];
      parkAt(other, spot[0], spot[1], 0);
      lane += 1;
    }
  }
  // Pedestrians out of the lens corridor: in v3 one stood beside the
  // camera and his shirt filled the bottom-left corner.
  for (const ped of state.peds) {
    if (Math.abs(ped.x) < 8 && ped.z > 40 && ped.z < 120) ped.x = ped.x < 0 ? -14 : 14;
  }
  // Low and close: 9 m behind the car, 3.2 m up, looking 22 m ahead.
  renderer.setShotCam([0, 3.2, 51], [0, 2, 82]);
  return { screen: SCREEN_PLAY };
}

/** The chase: mission 1, three stars, on foot with TWO cruisers right
 *  behind — Marco's line still on screen, a pedestrian fleeing ahead.
 *  Shot from the south side, close and low, so the player and both
 *  light bars fill the frame instead of a long empty street. */
function stageChase(world, renderer) {
  const state = world.state;
  state.missionIndex = 0;
  state.missionStage = 0;
  state.wanted = 3;
  world.debug.placePlayer(0, 0, Math.PI / 2);
  world.debug.spawnCops(2);
  const cops = state.cars.filter((car) => car.kind === 'cop');
  if (cops[0]) parkAt(cops[0], -8, 2, Math.PI / 2);
  if (cops[1]) {
    // Ahead-east, cutting the player off from the front: a pincer, not
    // two cruisers stacked on one bearing (v2 hid the second behind the
    // first).
    parkAt(cops[1], 6, 4, -Math.PI / 2);
  }
  // Clear the corridor: random traffic in the frame would read as a
  // third, unexplained car (in v1 a red traffic car sat centre-left).
  // Park them spread over the south side streets, off-frame.
  const offFrame = [];
  for (let lane = 0; lane < 14; lane += 1) {
    offFrame.push([lane % 2 === 0 ? -120 : 120, -180 + Math.floor(lane / 2) * 60]);
  }
  clearTraffic(state, offFrame);
  const ped = state.peds[0];
  if (ped) {
    ped.x = 7;
    ped.z = -1;
    ped.yaw = Math.PI / 2;
  }
  renderer.setShotCam([0.5, 2.6, -8.5], [-1, 1.3, 0.5]);
  return { screen: SCREEN_PLAY };
}

/** The mission shot: the player just dropped a pedestrian beside the red
 *  car while a cruiser closes in from the right. */
function stageMission(world, renderer) {
  const state = world.state;
  state.missionIndex = 0;
  state.missionStage = 1;
  state.objective = { x: -150, z: 150 };
  world.debug.placePlayer(0, 0, 0.35);
  const parked = nearestOfKind(state, 'parked');
  if (parked) {
    parked.x = 3.5;
    parked.z = 7;
    parked.yaw = 0.2;
    parked.color = 0xd21f2b;
  }
  // The punched pedestrian lies where the camera can see him: front-left
  // of the player, clear of the red car (in v1 the player hid him).
  const ped = state.peds[0];
  if (ped) {
    ped.x = -2.2;
    ped.z = 3;
    ped.mode = 'down';
    ped.modeTimer = 6;
  }
  // A second pedestrian watches from the sidewalk.
  const witness = state.peds[1];
  if (witness) {
    witness.x = -3.5;
    witness.z = 5.5;
    witness.yaw = 0.8;
  }
  world.debug.spawnCops(1);
  const cop = nearestOfKind(state, 'cop');
  if (cop) parkAt(cop, 10, 9, -0.6);
  renderer.setShotCam([-5.5, 3.2, -6.5], [1.5, 1.0, 5.5]);
  return { screen: SCREEN_PLAY };
}

/** The title over the dusk skyline: low over the south street, looking
 *  north across the facades toward the sunset band — not the old high
 *  top-down orbit, which read as a map. The live title screen still
 *  uses the slow orbit; this fixed camera is for the shot only. */
function stageStart(world, renderer) {
  renderer.setShotCam([60, 55, -140], [0, 20, 80]);
  return { screen: SCREEN_TITLE };
}

const SCENES = {
  cover: stageCover,
  chase: stageChase,
  mission: stageMission,
  start: stageStart,
};

/**
 * Set `world` and the camera to the named scene and return the screen to
 * draw over it. Unknown names fall back to the title scene.
 */
export function stageShot(name, world, renderer) {
  world.reset();
  const state = world.state;
  state.money = 50;
  renderer.camYaw = 0;
  const stage = SCENES[name] || stageStart;
  return stage(world, renderer);
}

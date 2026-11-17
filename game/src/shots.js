// The screenshot scenes behind ?shot=start|cover|chase|mission. Each one starts
// from a fresh world with a fixed seed, places the player in a real reachable
// state (a mission in progress, a wanted level, cops closing in), then plays
// the real rules forward for a few seconds with a simple autopilot, so the
// frame is what a short game really looks like and the same seed always
// gives the same frame.

import { STEP } from './config.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

/** Drive toward (tx, tz): full throttle, steering at the target. */
function driveToward(world, tx, tz) {
  const p = world.state.player;
  const car = p.car;
  const desired = Math.atan2(tx - p.x, tz - p.z);
  const steer = clamp(wrapAngle(desired - car.yaw) * 2.2, -1, 1);
  return { forward: 1, strafe: steer, run: false };
}

/** Run away from the nearest cop or officer. */
function runAway(world) {
  const p = world.state.player;
  let bx = p.x;
  let bz = p.z - 50;
  let best = Infinity;
  for (const car of world.state.cars) {
    if (car.kind !== 'cop') continue;
    const d = dist(p.x, p.z, car.x, car.z);
    if (d < best) {
      best = d;
      bx = p.x + (p.x - car.x);
      bz = p.z + (p.z - car.z);
    }
  }
  for (const off of world.state.officers) {
    const d = dist(p.x, p.z, off.x, off.z);
    if (d < best) {
      best = d;
      bx = p.x + (p.x - off.x);
      bz = p.z + (p.z - off.z);
    }
  }
  return { awayX: bx, awayZ: bz };
}

/** Frame a subject from a three-quarter rear-side view (cinematic shot camera). */
function frameSubject(renderer, x, z, yaw, back, side, height, ahead) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  renderer.setFreeCamera(
    [x - fx * back + rx * side, height, z - fz * back + rz * side],
    [x + fx * ahead, 1.5, z + fz * ahead],
  );
}
/** Step the world N fixed steps with a move function; camYaw follows the player. */
function simulate(world, renderer, seconds, moveFn) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const move = moveFn();
    const look = { camYaw: renderer.camYaw };
    world.step(STEP, move, look, 0);
    // Keep the chase camera behind the player while staging.
    renderer.setCamYaw(world.state.player.yaw);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw. The renderer
 * camera is left in follow mode (except `start`, which uses the title orbit),
 * so the shot is framed by the same camera a player sees.
 */
export function stageShot(name, world, renderer) {
  world.reset();
  const p = world.state.player;

  if (name === 'cover') {
    // Mission 2, mid-delivery: driving south down the x=60 avenue toward the
    // beach, the sun low over the sea ahead, two stars, two cruisers behind.
    world.debug.setMission(1);
    world.debug.placeInCar(60, 60, 0);
    world.state.player.car.color = 0xc23b2e; // bright red hero car for the cover
    world.debug.setWanted(2);
    world.debug.spawnCops(2);
    renderer.setCamYaw(0);
    simulate(world, renderer, 3.5, () => driveToward(world, 60, 185));
    const p2 = world.state.player;
    frameSubject(renderer, p2.x, p2.z, p2.car.yaw, 9, 2, 4, 10);
    return { screen: 'play' };
  }

  if (name === 'chase') {
    // On foot, three stars, officers closing in — run for the side streets.
    world.debug.placePlayer(0, 60, 0);
    world.debug.setWanted(3);
    world.debug.spawnCops(3);
    renderer.setCamYaw(0);
    simulate(world, renderer, 4, () => {
      const away = runAway(world);
      const desired = Math.atan2(away.awayX - p.x, away.awayZ - p.z);
      // Turn the camera to face the run direction, then run forward.
      renderer.setCamYaw(desired);
      return { forward: 1, strafe: 0, run: true };
    });
    frameSubject(renderer, p.x, p.z, p.yaw, 7, 3, 2.6, 6);
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // Mission 1, the first crime: a punch lands next to the stolen car while
    // a cruiser and an officer close in. Staged on the z=120 road so the
    // camera has a clear street view. The objective and the dialog stay visible.
    world.debug.placeInCar(-132, 120, Math.PI / 2);
    world.state.player.car.color = 0xc23b2e;
    // A moment in the car first, so the mission advances to "Drive to the
    // marina marker" — then the player steps out beside the car.
    simulate(world, renderer, 0.5, () => ({ forward: 0, strafe: 0, run: false }));
    world.debug.placePlayer(-140, 120, Math.PI / 2);
    const ped = world.state.peds[0];
    ped.x = p.x + 2.0;
    ped.z = p.z + 1.0;
    ped.mode = 'down';
    ped.downTimer = 2.5;
    p.punchAnim = 0.22;
    world.debug.setWanted(2);
    world.debug.spawnCops(1);
    // Bring the cruiser into the frame: it closes in and sends an officer out.
    const cop = world.state.cars.find((c) => c.kind === 'cop');
    if (cop) {
      cop.x = p.x + 26;
      cop.z = p.z + 8;
    }
    renderer.setCamYaw(Math.PI / 2);
    simulate(world, renderer, 1.2, () => ({ forward: 0, strafe: 0, run: false }));
    p.punchAnim = 0.22;
    frameSubject(renderer, p.x, p.z, p.yaw, 6, 4, 2.8, 6);
    return { screen: 'play' };
  }

  // `start` (and anything unknown): the title screen over a living city.
  simulate(world, renderer, 6, () => ({ forward: 0, strafe: 0, run: false }));
  return { screen: 'title' };
}

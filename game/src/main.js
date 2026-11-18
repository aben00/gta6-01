// Sunset Heat — boot and the one loop: input is read every frame, the
// world advances in fixed 1/60 s steps (several in a slow frame, none in
// a fast one), and the renderer paints what is there. Four screens: title,
// play, paused and busted.
//
// ?seed=N fixes the city and the traffic. ?shot=cover|chase|mission|start
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
//
// window.__sunset is the debug handle the play-test drives: the current
// screen, the live state, the world (with its debug helpers) and the
// renderer.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EV_BUSTED, EV_CRASH, EV_HITPED, EV_HORN, EV_MISSION, EV_PUNCH,
  EV_REPAIRED, EV_STASH, EV_STORY, EV_TICK,
} from './world.js';
import { createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;
/** Seconds of no mouse input before the camera eases behind the car. */
const CAM_FOLLOW_IDLE = 2.5;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, world.layout, createRandom(seed));
const audio = createAudio();

let screen = SCREEN_TITLE;

window.__sunset = {
  screen: () => screen,
  state: world.state,
  world,
  renderer,
};

/** The one-line status screen readers announce. */
function announce(message) {
  status.textContent = message;
}

/** Screenshot mode: stage the scene, paint it twice, flag it ready. */
function bootShot(name) {
  const scene = stageShot(name, world, renderer);
  let painted = 0;
  function paint() {
    // A fixed clock keeps the staged frame identical every run.
    renderer.draw(world.state, scene.screen, STEP, 1.0);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

/** The playable game: the loop, the screens and the sounds. */
class SunsetGame {
  constructor() {
    this.input = createInput(canvas);
    this.accumulator = 0;
    this.last = performance.now();
    this.lastMouseAt = -99;
    this.elapsed = 0;
    this.frame = this.frame.bind(this);
  }

  start() {
    screen = SCREEN_PLAY;
    this.input.clearPresses();
    announce('Playing. Steal a car — walk up to one and press E.');
  }

  /** Turn a step's event flags into screens and sounds. */
  routeEvents(events) {
    if (events & EV_BUSTED) {
      screen = SCREEN_BUSTED;
      announce('Busted. Press Enter to wake up at the safehouse.');
    }
    if (events & EV_STASH) audio.chime();
    if (events & EV_MISSION) audio.chime();
    if (events & EV_STORY) audio.chime();
    if (events & EV_REPAIRED) audio.click();
    if (events & (EV_PUNCH | EV_HITPED)) audio.thud();
    if (events & EV_HORN) audio.horn();
    if (events & EV_CRASH) audio.crash();
    if (events & EV_TICK) audio.tick();
  }

  /** The confirm key: title starts, busted respawns, paused resumes. */
  confirmPressed() {
    if (screen === SCREEN_TITLE) {
      this.start();
    } else if (screen === SCREEN_BUSTED) {
      world.respawn();
      screen = SCREEN_PLAY;
      announce('Back on the street. The safehouse again.');
    } else if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  /** The pause key: play pauses, paused resumes. */
  pausePressed() {
    if (screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  /** One-shot presses: menus first, then the in-play actions. */
  routePresses() {
    if (this.input.takePress('mute')) {
      audio.setMuted(!audio.muted);
      return;
    }
    if (this.input.takePress('confirm')) {
      this.confirmPressed();
      return;
    }
    if (this.input.takePress('pause')) {
      this.pausePressed();
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    if (this.input.takePress('interact')) this.routeEvents(world.interact());
    if (this.input.takePress('punch')) this.routeEvents(world.punch());
    if (this.input.takePress('horn')) this.routeEvents(world.horn());
  }

  /** The camera: drag orbits it, and it follows the car when idle. */
  followCamera(frameSeconds) {
    const look = this.input.takeLook();
    if (look.x !== 0 || look.y !== 0) {
      renderer.camYaw -= look.x * 0.0045;
      this.lastMouseAt = this.elapsed;
      return;
    }
    if (world.state.player.onFoot) return;
    if (this.elapsed - this.lastMouseAt <= CAM_FOLLOW_IDLE) return;
    // Hands off the mouse while driving: ease the camera behind the car.
    let diff = world.state.player.yaw - renderer.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    renderer.camYaw += diff * Math.min(1, frameSeconds * 1.4);
  }

  /** Advance the world by the fixed steps this frame owes. */
  advance() {
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      if (screen === SCREEN_TITLE) {
        world.step(STEP, { forward: 0, strafe: 0, run: false }, { camYaw: 0 }, this.elapsed);
      } else if (screen === SCREEN_PLAY) {
        const events = world.step(STEP, this.input.moveInput(), { camYaw: renderer.camYaw }, this.elapsed);
        this.routeEvents(events);
      }
    }
  }

  frame(now) {
    requestAnimationFrame(this.frame);
    const frameSeconds = Math.min((now - this.last) / 1000, MAX_FRAME);
    this.last = now;
    this.accumulator += frameSeconds;
    this.elapsed += frameSeconds;
    this.followCamera(frameSeconds);
    this.routePresses();
    this.advance();
    audio.update(world.state);
    renderer.draw(world.state, screen, STEP, this.elapsed);
  }

  run() {
    document.getElementById('start-button').addEventListener('click', () => {
      audio.setMuted(audio.muted);
      if (screen === SCREEN_TITLE) this.start();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    });
    announce('Sunset Heat. Press Enter or START ENGINE to play.');
    requestAnimationFrame(this.frame);
  }
}

if (shot) bootShot(shot);
else new SunsetGame().run();

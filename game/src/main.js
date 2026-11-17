// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play,
// paused, busted and story-complete. Money and mission progress are saved to
// localStorage when a mission is completed or the player is busted.
//
// ?seed=N fixes the city. ?shot=start|cover|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { COPS, MISSIONS, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { ACTION_ADVANCE, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer } from './render.js';
import { EV_BUSTED, EV_MISSION, EV_STORY, createWorld } from './world.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
const SAVE_VERSION = 1;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const hud = {
  hud: document.getElementById('hud'),
  money: document.getElementById('money'),
  wanted: document.getElementById('wanted'),
  healthFill: document.getElementById('health-fill'),
  missionName: document.getElementById('mission-name'),
  objective: document.getElementById('objective'),
  speed: document.getElementById('speed'),
  timer: document.getElementById('timer'),
  dialogBox: document.getElementById('dialog-box'),
  dialogSpeaker: document.getElementById('dialog-speaker'),
  dialogText: document.getElementById('dialog-text'),
  minimap: document.getElementById('minimap'),
};

const random = createRandom(seed);
const audio = createAudio();
const world = createWorld(random, audio);
const renderer = createRenderer(canvas, hud, { highQuality: Boolean(shot) });
renderer.buildStatic(world.city, random);

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.v !== SAVE_VERSION || typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: SAVE_VERSION,
      money: world.state.money,
      missionIndex: world.state.missionIndex,
      storyDone: world.state.storyDone,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function applySave(data) {
  if (!data) return;
  world.state.money = data.money;
  if (data.storyDone) {
    world.state.storyDone = true;
    world.state.missionIndex = 3;
    world.state.objective = 'Story complete — free roam';
    world.state.marker = null;
  } else if (data.missionIndex > 0 && data.missionIndex < 3) {
    world.debug.setMission(data.missionIndex);
  }
}

function runShot(name) {
  const scene = stageShot(name, world, renderer);
  // The title overlay is visible in the HTML by default: hide every overlay
  // for play scenes so the staged frame is the game itself. The title scene
  // keeps its overlay — it IS the start screen.
  if (scene.screen !== 'title') {
    for (const id of ['title-screen', 'paused-screen', 'busted-screen', 'story-screen']) {
      document.getElementById(id).style.display = 'none';
    }
  }
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, STEP, performance.now() / 1000);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const saved = readSave();
  let screen = 'title';
  let bannerTimer = 0;
  let accumulator = 0;
  let last = performance.now();

  const overlays = {
    title: document.getElementById('title-screen'),
    paused: document.getElementById('paused-screen'),
    busted: document.getElementById('busted-screen'),
    story: document.getElementById('story-screen'),
  };
  const banner = document.getElementById('banner');
  const bustedFine = document.getElementById('busted-fine');
  const continueBtn = document.getElementById('continue-btn');
  const newBtn = document.getElementById('new-btn');

  function showOnly(name) {
    for (const [key, el] of Object.entries(overlays)) {
      el.style.display = key === name ? 'flex' : 'none';
    }
  }

  function announce(message) {
    status.textContent = message;
  }

  function showBanner(text) {
    banner.textContent = text;
    banner.style.display = 'block';
    bannerTimer = 3.2;
  }

  function startGame(fresh) {
    if (fresh) {
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch {
        // Ignore storage errors.
      }
      world.reset();
    } else {
      const data = readSave();
      world.reset();
      applySave(data);
    }
    accumulator = 0;
    screen = 'play';
    showOnly(null);
    announce('Playing. Follow the objective on the left.');
  }

  function toTitle() {
    screen = 'title';
    showOnly('title');
    continueBtn.style.display = saved ? 'inline-block' : 'none';
    announce('Sunset Heat. Press Enter to start.');
  }

  function bustPlayer() {
    screen = 'busted';
    showOnly('busted');
    bustedFine.textContent = `The Solmarina PD fined you $${COPS.bustFine}.`;
    audio.busted();
    writeSave();
    announce('Busted. Press Enter to continue.');
  }

  function handleEvents(events) {
    if (events & EV_MISSION) {
      const done = MISSIONS[Math.min(world.state.missionIndex, MISSIONS.length) - 1];
      showBanner(done ? `MISSION COMPLETE  ·  +$${done.reward}` : 'MISSION COMPLETE');
      writeSave();
    }
    if (events & EV_STORY) {
      screen = 'story';
      showOnly('story');
      writeSave();
      announce('Story complete. Solmarina is yours.');
    }
    if (events & EV_BUSTED) bustPlayer();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      showBanner(muted ? 'Sound off (M to turn on)' : 'Sound on');
    }
    if (screen === 'title') {
      if (actions & ACTION_CONFIRM) startGame(false);
      return;
    }
    if (screen === 'busted') {
      if (actions & ACTION_CONFIRM) {
        world.applyBusted();
        screen = 'play';
        showOnly(null);
        announce('Back on the streets.');
      }
      return;
    }
    if (screen === 'story') {
      if (actions & ACTION_CONFIRM) {
        screen = 'play';
        showOnly(null);
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === 'play') {
        screen = 'paused';
        showOnly('paused');
        announce('Paused.');
      } else if (screen === 'paused') {
        screen = 'play';
        showOnly(null);
        announce('Playing.');
      }
    }
    return actions;
  }

  function step() {
    const look = input.takeLook();
    if (look.dx !== 0 || look.dy !== 0) renderer.orbit(look.dx, look.dy, world.state.elapsed);
    const wheel = input.takeWheel();
    if (wheel !== 0) renderer.zoom(wheel);
    const actions = handleActions() ?? 0;
    const move = input.move();
    const events = world.step(STEP, move, { camYaw: renderer.camYaw }, actions);
    handleEvents(events);
    audio.update(STEP, {
      driving: !world.state.player.onFoot,
      speedRatio: Math.abs(world.state.player.car ? world.state.player.car.speed : 0) / 30,
      throttle: world.state.player.throttle,
      wanted: world.state.wanted,
      copDistance: world.nearestCopDistance(),
    });
    if (bannerTimer > 0) {
      bannerTimer -= STEP;
      if (bannerTimer <= 0) banner.style.display = 'none';
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (screen === 'title') {
      while (accumulator >= STEP) {
        world.step(STEP, { forward: 0, strafe: 0, run: false }, { camYaw: renderer.camYaw }, 0);
        accumulator -= STEP;
      }
      handleActions();
    } else if (screen === 'play') {
      while (accumulator >= STEP && screen === 'play') {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      handleActions();
    }
    renderer.draw(world.state, screen, STEP, now / 1000);
  }

  // Leaving the tab pauses a running game rather than letting the cops close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      showOnly('paused');
      announce('Paused.');
    }
  });

  // Audio needs a user gesture before it may start.
  window.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
  window.addEventListener('keydown', () => audio.unlock());

  newBtn.addEventListener('click', () => {
    audio.unlock();
    startGame(true);
  });
  continueBtn.addEventListener('click', () => {
    audio.unlock();
    startGame(false);
  });
  document.getElementById('resume-btn').addEventListener('click', () => {
    screen = 'play';
    showOnly(null);
  });
  document.getElementById('busted-btn').addEventListener('click', () => {
    world.applyBusted();
    screen = 'play';
    showOnly(null);
  });
  document.getElementById('story-btn').addEventListener('click', () => {
    screen = 'play';
    showOnly(null);
  });

  // For play-tests and debugging: the live state, read-only from the console.
  window.__sunset = {
    version: '1.0.0',
    world,
    renderer,
    screen: () => screen,
    state: world.state,
  };

  toTitle();
  announce('Sunset Heat. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

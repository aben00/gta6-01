// Keyboard and mouse input. Held keys give movement; one-shot presses (start,
// interact, punch, pause, advance dialogue) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost or counted
// twice. Mouse drag orbits the camera; clicking the canvas also takes pointer
// lock on desktop, where mouse movement orbits instead.

export const ACTION_CONFIRM = 1;
export const ACTION_INTERACT = 2;
export const ACTION_PUNCH = 4;
export const ACTION_PAUSE = 8;
export const ACTION_ADVANCE = 16;
export const ACTION_MUTE = 32;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const CONFIRM = new Set(['Enter', 'Space']);
const INTERACT = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let lookDX = 0;
  let lookDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let locked = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) event.preventDefault();
      return;
    }
    keys.add(event.code);
    if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM | ACTION_ADVANCE;
    else if (INTERACT.has(event.code)) actions |= ACTION_INTERACT;
    else if (PUNCH.has(event.code)) actions |= ACTION_PUNCH;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || CONFIRM.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of all of them on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    dragging = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    if (!locked && canvas.requestPointerLock) {
      try {
        canvas.requestPointerLock();
      } catch {
        // Pointer lock is a nicety; drag still works without it.
      }
    }
  });
  window.addEventListener('pointerup', (event) => {
    dragging = false;
    // A click (not a drag) while playing is a punch; the loop decides by screen.
    if (Math.abs(event.clientX - lastX) < 6 && Math.abs(event.clientY - lastY) < 6) {
      actions |= ACTION_PUNCH | ACTION_ADVANCE;
    }
  });
  window.addEventListener('pointermove', (event) => {
    if (locked) {
      lookDX += event.movementX || 0;
      lookDY += event.movementY || 0;
    } else if (dragging) {
      lookDX += event.clientX - lastX;
      lookDY += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
    }
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) dragging = false;
  });
  // Mouse wheel zooms the chase camera in and out; the renderer reads it.
  let wheel = 0;
  canvas.addEventListener('wheel', (event) => {
    wheel += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  return {
    /** -1/0/1 forward and strafe, from the held keys. */
    move() {
      const f = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
      const b = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
      const l = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0;
      const r = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0;
      return { forward: f - b, strafe: r - l, run: keys.has('ShiftLeft') || keys.has('ShiftRight') };
    },
    /** Mouse-look deltas since the last call, in pixels. */
    takeLook() {
      const dx = lookDX;
      const dy = lookDY;
      lookDX = 0;
      lookDY = 0;
      return { dx, dy };
    },
    /** Wheel delta since the last call. */
    takeWheel() {
      const w = wheel;
      wheel = 0;
      return w;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    isLocked() {
      return locked;
    },
  };
}

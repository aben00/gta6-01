// Keyboard and mouse input. Held keys give a movement vector each frame;
// one-shot presses (enter a car, punch, honk, pause, mute, confirm) are
// queued and taken exactly once by the loop, so a press between two
// frames is never lost and never counted twice. Dragging the mouse orbits
// the camera; a short click without a drag is a punch.

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const CONFIRM_KEYS = new Set(['Enter', 'Space']);

export function createInput(canvas) {
  const held = new Set();
  const presses = new Set();
  let lookDeltaX = 0;
  let lookDeltaY = 0;
  let dragStart = null;
  let draggedFar = false;

  function press(name, event) {
    if (event && event.repeat) return;
    presses.add(name);
  }

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS.has(event.code) || CONFIRM_KEYS.has(event.code)) event.preventDefault();
    switch (event.code) {
      case 'KeyE':
        press('interact', event);
        break;
      case 'KeyF':
        press('punch', event);
        break;
      case 'KeyH':
        press('horn', event);
        break;
      case 'KeyP':
      case 'Escape':
        press('pause', event);
        break;
      case 'KeyM':
        press('mute', event);
        break;
      case 'Enter':
        press('confirm', event);
        break;
      case 'Space':
        held.add('Space');
        break;
      default:
        if (MOVE_KEYS.has(event.code)) held.add(event.code);
        break;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.add('Shift');
  });

  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.delete('Shift');
    if (event.code === 'Space') held.delete('Space');
  });

  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    held.clear();
  });

  canvas.addEventListener('pointerdown', (event) => {
    dragStart = { x: event.clientX, y: event.clientY };
    draggedFar = false;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) draggedFar = true;
    lookDeltaX += event.movementX || dx * 0.2;
    lookDeltaY += event.movementY || dy * 0.2;
    dragStart = { x: event.clientX, y: event.clientY };
  });
  window.addEventListener('pointerup', () => {
    if (dragStart && !draggedFar) presses.add('punch');
    dragStart = null;
  });

  function axis() {
    const forward = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
    const strafe = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
    return { forward, strafe };
  }

  return {
    /** True while this key (a KeyboardEvent.code) is held down. */
    isHeld(code) {
      return held.has(code);
    },
    /**
     * The movement the player wants this frame, in camera space:
     * forward (+1 is away from the camera), strafe (+1 is right),
     * run while Shift is held, and brake while Space is held.
     */
    moveInput() {
      const { forward, strafe } = axis();
      return { forward, strafe, run: held.has('Shift'), brake: held.has('Space') };
    },
    /** Mouse-orbit accumulated since the last call, in pixels. */
    takeLook() {
      const taken = { x: lookDeltaX, y: lookDeltaY };
      lookDeltaX = 0;
      lookDeltaY = 0;
      return taken;
    },
    /** True once for each press of `name` since the last call. */
    takePress(name) {
      if (!presses.has(name)) return false;
      presses.delete(name);
      return true;
    },
    /** Drop any queued presses (for example when the screen changes). */
    clearPresses() {
      presses.clear();
    },
  };
}

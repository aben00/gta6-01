// Keyboard and mouse input for Sunset Heat.
//
// Held keys give a movement vector each frame. One-shot presses — enter
// a car, punch, honk, pause, mute, confirm — are queued and taken exactly
// once by the loop, so a press that lands between two frames is never
// lost and never counted twice. Dragging the mouse orbits the camera;
// a short click without a drag is a punch.

const MOVE_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);
const CONFIRM_CODES = new Set(['Enter', 'Space']);

/** Which one-shot press a key code queues, if any. */
const PRESS_BY_CODE = {
  KeyE: 'interact',
  KeyF: 'punch',
  KeyH: 'horn',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
  Enter: 'confirm',
};

/** Pixels of pointer travel before a press stops being a click. */
const DRAG_THRESHOLD = 6;

/**
 * Reads the keyboard and the pointer, and hands the loop a movement
 * vector plus one-shot presses. Attach once, at boot.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.queued = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.dragFrom = null;
    this.dragged = false;
    this.attach();
  }

  attach() {
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
    // A key released while the tab is hidden never sends keyup: let go.
    window.addEventListener('blur', () => this.held.clear());

    this.canvas.addEventListener('pointerdown', (event) => {
      this.dragFrom = { x: event.clientX, y: event.clientY };
      this.dragged = false;
    });
    window.addEventListener('pointermove', (event) => this.onPointerMove(event));
    window.addEventListener('pointerup', () => {
      if (this.dragFrom && !this.dragged) this.queued.add('punch');
      this.dragFrom = null;
    });
  }

  onKeyDown(event) {
    if (MOVE_CODES.has(event.code) || CONFIRM_CODES.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    const press = PRESS_BY_CODE[event.code];
    if (press) this.queued.add(press);
    if (event.code === 'Space' || MOVE_CODES.has(event.code)) this.held.add(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.held.add('Shift');
  }

  onKeyUp(event) {
    this.held.delete(event.code);
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.held.delete('Shift');
    if (event.code === 'Space') this.held.delete('Space');
  }

  onPointerMove(event) {
    if (!this.dragFrom) return;
    const dx = event.clientX - this.dragFrom.x;
    const dy = event.clientY - this.dragFrom.y;
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) this.dragged = true;
    this.lookX += event.movementX || dx * 0.2;
    this.lookY += event.movementY || dy * 0.2;
    this.dragFrom = { x: event.clientX, y: event.clientY };
  }

  /** True while this key (a KeyboardEvent.code) is held down. */
  isHeld(code) {
    return this.held.has(code);
  }

  /**
   * The movement the player wants this frame, in camera space:
   * forward (+1 is away from the camera), strafe (+1 is right),
   * run while Shift is held, and brake while Space is held.
   */
  moveInput() {
    const forward =
      (this.held.has('KeyW') || this.held.has('ArrowUp') ? 1 : 0)
      - (this.held.has('KeyS') || this.held.has('ArrowDown') ? 1 : 0);
    const strafe =
      (this.held.has('KeyD') || this.held.has('ArrowRight') ? 1 : 0)
      - (this.held.has('KeyA') || this.held.has('ArrowLeft') ? 1 : 0);
    return { forward, strafe, run: this.held.has('Shift'), brake: this.held.has('Space') };
  }

  /** Mouse-orbit accumulated since the last call, in pixels. */
  takeLook() {
    const taken = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return taken;
  }

  /** True once for each press of `name` since the last call. */
  takePress(name) {
    if (!this.queued.has(name)) return false;
    this.queued.delete(name);
    return true;
  }

  /** Drop any queued presses (for example when the screen changes). */
  clearPresses() {
    this.queued.clear();
  }
}

/** Build the input reader for a canvas. */
export function createInput(canvas) {
  return new Input(canvas);
}

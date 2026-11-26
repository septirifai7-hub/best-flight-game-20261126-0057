// Keyboard + mouse input for Steel Falcon. Keys are tracked by `code`
// (layout independent); mouse steering moves an aim point the jet follows.
// Pointer lock is not used — the game must also play in a headless
// screenshot run, so mouse position is read relative to the canvas.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since last poll()
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.rightDown = false;
    this.rightClicked = false;
    this.anyKey = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.anyKey = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
      if (e.button === 2) { this.rightDown = true; this.rightClicked = true; }
      this.anyKey = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) { return this.keys.has(code); }

  // True once per physical press; consumed by poll().
  wasPressed(code) { return this.pressed.has(code); }

  // Call once per frame: clears edge-triggered state.
  poll() {
    this.pressed.clear();
    this.mouseClicked = false;
    this.rightClicked = false;
    this.anyKey = false;
  }

  // -1..1 steering from arrow keys.
  steerX() {
    let x = 0;
    if (this.down('ArrowLeft') || this.down('KeyA')) x -= 1;
    if (this.down('ArrowRight') || this.down('KeyD')) x += 1;
    return x;
  }

  steerY() {
    // Arrows only: W/S are throttle, so they must not pitch the jet.
    let y = 0;
    if (this.down('ArrowUp')) y -= 1;
    if (this.down('ArrowDown')) y += 1;
    return y;
  }
}

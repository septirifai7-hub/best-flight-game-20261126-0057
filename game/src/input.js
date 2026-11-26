// Keyboard and mouse input. One job: turn raw device events into a
// single plain object the flight model reads every frame.
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    pitch: 0,    // -1 pull up .. +1 push down (from ArrowUp/Down or W/S)
    roll: 0,     // -1 left .. +1 right (ArrowLeft/Right or A/D)
    throttle: 0, // -1 idle .. +1 full (Shift / Ctrl held, or +/- keys)
    throttleHeld: false,
    drop: false, // pressed this frame: release a parcel
    pause: false,
    mute: false,
    confirm: false, // Enter pressed this frame
    restart: false, // R pressed this frame
    mission: 0,     // 1..3 pressed this frame
    mouseX: 0.5,    // 0..1 across the canvas; steers gently when moved
    mouseActive: false,
    anyKey: false,
  };

  const down = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    input.anyKey = true;
    if (e.code === 'Space') input.drop = true;
    if (e.code === 'Enter') input.confirm = true;
    if (e.code === 'KeyR') input.restart = true;
    if (e.code === 'KeyP' || e.code === 'Escape') input.pause = true;
    if (e.code === 'KeyM') input.mute = true;
    if (e.code === 'Digit1') input.mission = 1;
    if (e.code === 'Digit2') input.mission = 2;
    if (e.code === 'Digit3') input.mission = 3;
    if (e.code === 'KeyT') input.toTitle = true;
  };
  const up = (e) => keys.delete(e.code);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - r.left) / r.width;
    input.mouseActive = true;
  });
  canvas.addEventListener('mousedown', () => { input.drop = true; input.anyKey = true; });

  // Read the live key set into the frame's control values.
  input.poll = () => {
    const k = (c) => keys.has(c);
    input.pitch = (k('ArrowDown') || k('KeyS') ? 1 : 0) + (k('ArrowUp') || k('KeyW') ? -1 : 0);
    input.roll = (k('ArrowRight') || k('KeyD') ? 1 : 0) + (k('ArrowLeft') || k('KeyA') ? -1 : 0);
    input.throttle = (k('ShiftLeft') || k('ShiftRight') || k('Equal') ? 1 : 0) +
      (k('ControlLeft') || k('ControlRight') || k('Minus') ? -1 : 0);
    input.throttleHeld = input.throttle !== 0;
  };

  // Edge-triggered flags are consumed once per frame by the game.
  input.consumeEdges = () => {
    const edges = { drop: input.drop, confirm: input.confirm, restart: input.restart, pause: input.pause, mute: input.mute, mission: input.mission, toTitle: input.toTitle };
    input.drop = input.confirm = input.restart = input.pause = input.mute = input.toTitle = false;
    input.mission = 0;
    return edges;
  };
  return input;
}

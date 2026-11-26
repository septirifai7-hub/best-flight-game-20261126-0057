// Synthesised sound: every effect is built with WebAudio oscillators
// and filtered noise, so the game ships no audio files at all.
// Audio starts only after a user gesture; headless runs stay silent.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windSrc = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return false; }
    started = true;
    // Engine: two detuned saws through a low-pass, pitch follows throttle.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 70;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 71.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineOsc.connect(lp); osc2.connect(lp); lp.connect(engineGain); engineGain.connect(ctx.destination);
    engineOsc.start(); osc2.start();
    // Wind: looped noise buffer, loudness follows airspeed.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buf; windSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    windSrc.connect(bp); bp.connect(windGain); windGain.connect(ctx.destination);
    windSrc.start();
    return true;
  }

  function blip(freq, dur, type = 'sine', vol = 0.2, slide = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  return {
    // Call on any gesture; safe to call every frame.
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) { muted = m; if (engineGain) engineGain.gain.value = 0; if (windGain) windGain.gain.value = 0; },
    isMuted() { return muted; },
    // Continuous engine + wind, called every frame with 0..1 values.
    update(throttle, speedNorm) {
      if (!ctx || muted || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(0.05 + throttle * 0.06, t, 0.1);
      if (engineOsc) engineOsc.frequency.setTargetAtTime(62 + throttle * 55, t, 0.1);
      windGain.gain.setTargetAtTime(speedNorm * 0.05, t, 0.15);
    },
    ring() { blip(880, 0.18, 'sine', 0.22); blip(1318, 0.3, 'sine', 0.16); },
    centre() { blip(1046, 0.12, 'sine', 0.2); blip(1568, 0.35, 'sine', 0.2); },
    drop() { blip(520, 0.12, 'triangle', 0.2, -220); },
    thud() { blip(90, 0.25, 'sine', 0.35, -40); },
    crash() { blip(140, 0.7, 'sawtooth', 0.3, -100); },
    alarm() { blip(660, 0.14, 'square', 0.08); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.35, 'sine', 0.18), i * 110)); },
  };
}

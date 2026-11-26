// Synthesised WebAudio sounds for Steel Falcon — no audio files. Engine
// drone follows throttle, gunfire is a filtered noise burst, missiles a
// rising whoosh, explosions a noise burst plus a low sine thump.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // 1 s of white noise, reused by every noise-based sound.
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // Engine: two detuned saws through a low-pass, always running.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 58;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    osc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    osc2.start();
    this.engineOsc2 = osc2;
  }

  setEngine(throttle, speedNorm, flying) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const target = flying ? 0.05 + throttle * 0.05 + speedNorm * 0.02 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.15);
    const freq = 48 + throttle * 70 + speedNorm * 40;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.02 + 2, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(240 + throttle * 900, t, 0.2);
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx && this.engineGain) {
      this.engineGain.gain.setTargetAtTime(m ? 0 : 0.06, this.ctx.currentTime, 0.05);
    }
  }

  _noise(dur, filterType, freq, gain, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const flt = this.ctx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + dur + 0.05);
  }

  gun() { this._noise(0.09, 'highpass', 900, 0.22); }

  missileLaunch() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(300, t);
    flt.frequency.exponentialRampToValueAtTime(2400, t + 0.7);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    src.connect(flt); flt.connect(g); g.connect(this.ctx.destination);
    src.start(t); src.stop(t + 0.85);
  }

  explosion(big = false) {
    this._noise(big ? 1.4 : 0.8, 'lowpass', big ? 500 : 800, big ? 0.5 : 0.32);
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(big ? 90 : 120, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + (big ? 1.0 : 0.5));
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(big ? 0.5 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 1.1 : 0.6));
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 1.2);
  }

  lockBeep() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1180;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.1);
  }

  chime() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    for (const [f, d] of [[660, 0], [990, 0.09]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, t + d);
      g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.35);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t + d); osc.stop(t + d + 0.4);
    }
  }

  warning() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.setValueAtTime(390, t + 0.14);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + 0.32);
  }
}

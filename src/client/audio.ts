/** Synthesised sound: an engine note that follows speed, and short effects. Starts on the first tap (iOS rule). */
export const AUDIO = { master: 0.35, engineBase: 70, enginePerSpeed: 5.5 };

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engine2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : AUDIO.master;
    this.master.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engine = ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine2 = ctx.createOscillator();
    this.engine2.type = 'square';
    this.engine.connect(filter);
    this.engine2.connect(filter);
    filter.connect(this.engineGain).connect(this.master);
    this.engine.start();
    this.engine2.start();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : AUDIO.master;
  }

  engineAt(speed: number, boosting: boolean, on: boolean): void {
    if (!this.ctx || !this.engine || !this.engine2 || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const f = AUDIO.engineBase + speed * AUDIO.enginePerSpeed + (boosting ? 40 : 0);
    this.engine.frequency.setTargetAtTime(f, t, 0.05);
    this.engine2.frequency.setTargetAtTime(f * 0.501, t, 0.05);
    this.engineGain.gain.setTargetAtTime(on ? 0.12 : 0, t, 0.1);
  }

  tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.25, slideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur: number, vol = 0.3, freq = 800): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }
}

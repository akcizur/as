/**
 * Procedural Web Audio Manager for Third-Person Controller
 * Synthesizes subtle, organic randomized footsteps synced to walk/run state & surface type,
 * plus jump takeoff, landing thuds, and obstacle collision impacts proportional to velocity.
 */

class SoundEffectManager {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private isMuted = false;
  private masterVolume = 0.65;
  private stepFootIndex = 0; // alternates 0 (left) and 1 (right)

  private ensureContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.createNoiseBuffer(this.ctx);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // Ignore until next user gesture
      });
    }

    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext) {
    const bufferSize = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    // Generate pink-tinted noise for warmer, natural acoustic texture
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
      b6 = white * 0.115926;
    }
    this.noiseBuffer = buffer;
  }

  public unlock() {
    this.ensureContext();
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
  }

  public getVolume(): number {
    return this.masterVolume;
  }

  /**
   * Triggers a subtle randomized footstep sound tailored to `isRunning` and the floor surface.
   */
  public playFootstep(isRunning: boolean, surfaceName = 'map/floor') {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer || this.masterVolume <= 0.01) return;

    const now = ctx.currentTime;
    const isBoxSurface = surfaceName !== 'map/floor';
    const isLeftFoot = this.stepFootIndex % 2 === 0;
    this.stepFootIndex++;

    // Randomize pitch & filter slightly on every step
    const randPitch = 0.88 + Math.random() * 0.24;
    const randGain = 0.85 + Math.random() * 0.3;

    const baseGain = (isRunning ? 0.26 : 0.14) * this.masterVolume * randGain;
    const duration = isRunning ? 0.085 : 0.115;

    // Stereo panning (subtle left/right foot alternation)
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.setValueAtTime((isLeftFoot ? -0.14 : 0.14) + (Math.random() - 0.5) * 0.06, now);
      panner.connect(ctx.destination);
    }
    const targetNode = panner || ctx.destination;

    // 1. Low-end heel thud oscillator
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    const startFreq = (isBoxSurface ? 135 : 95) * (isRunning ? 1.15 : 1.0) * randPitch;
    const endFreq = (isBoxSurface ? 48 : 34) * randPitch;

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration * 0.75);

    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(baseGain * 0.9, now + 0.006);
    oscGain.gain.exponentialRampToValueAtTime(0.0008, now + duration * 0.85);

    osc.connect(oscGain);
    oscGain.connect(targetNode);
    osc.start(now);
    osc.stop(now + duration);

    // 2. Filtered pink-noise sole scuff / grit transient
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const centerFreq = (isRunning ? 1150 : 780) * (isBoxSurface ? 1.35 : 1.0) * randPitch;
    filter.frequency.setValueAtTime(centerFreq, now);
    filter.Q.setValueAtTime(isRunning ? 2.2 : 2.8, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(baseGain * 1.1, now + 0.012);
    noiseGain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(targetNode);

    const randomOffset = Math.random() * 1.0;
    noiseSource.start(now, randomOffset, duration + 0.02);
  }

  /**
   * Triggers a jump takeoff sound
   */
  public playJump() {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer || this.masterVolume <= 0.01) return;

    const now = ctx.currentTime;
    const gainVal = 0.22 * this.masterVolume;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.exponentialRampToValueAtTime(195, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Triggers a landing impact sound or obstacle collision thud proportional to impactSpeed
   */
  public playImpact(impactSpeed: number, type: 'landing' | 'wall' = 'landing') {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer || this.masterVolume <= 0.01) return;

    const normalizedIntensity = Math.min(1.0, Math.max(0.15, (impactSpeed - 1.0) / 8.0));
    const now = ctx.currentTime;
    const gainVal = (type === 'landing' ? 0.42 : 0.32) * normalizedIntensity * this.masterVolume;
    const duration = 0.12 + normalizedIntensity * 0.14;

    // Deep sub-bass impact thud
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    const baseFreq = type === 'landing' ? 92 : 115;
    osc.frequency.setValueAtTime(baseFreq * (0.9 + Math.random() * 0.2), now);
    osc.frequency.exponentialRampToValueAtTime(24, now + duration);

    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(gainVal, now + 0.008);
    oscGain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);

    // Dual-foot landing scuff or wall scrape
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(type === 'landing' ? 950 : 680, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + duration);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(gainVal * 0.85, now + 0.015);
    noiseGain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSource.start(now, Math.random() * 0.8, duration + 0.02);
  }
}

export const audioManager = new SoundEffectManager();

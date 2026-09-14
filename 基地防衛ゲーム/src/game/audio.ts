export type SfxId = 'attack' | 'hit' | 'kill' | 'hurt' | 'coin' | 'chest' | 'levelUp' | 'upgrade' | 'build' | 'confirm' | 'error' | 'wave' | 'bossAppear' | 'bossDefeat' | 'unlock' | 'gameOver';

export const SFX_COOLDOWNS: Record<SfxId, number> = {
  attack: .075, hit: .045, kill: .09, hurt: .16, coin: .12, chest: .3, levelUp: .5,
  upgrade: .16, build: .2, confirm: .055, error: .2, wave: .5, bossAppear: 1,
  bossDefeat: 1, unlock: .7, gameOver: 1,
};
export const clampSfxVolume = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .55;

type AC = AudioContext;
class SoundEffects {
  private context: AC | null = null;
  private volume = .55;
  private muted = false;
  private last = new Map<SfxId, number>();
  private voices = 0;
  private readonly maxVoices = 10;

  configure(volume: number, muted: boolean) { this.volume = clampSfxVolume(volume); this.muted = muted; }
  get settings() { return { volume: this.volume, muted: this.muted }; }
  unlock() {
    if (typeof window === 'undefined') return;
    const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    this.context ??= new AudioCtor();
    if (this.context.state === 'suspended') void this.context.resume();
  }
  play(id: SfxId, delay = 0) {
    if (this.muted || this.volume <= 0) return false;
    this.unlock(); const ctx = this.context; if (!ctx || ctx.state === 'closed') return false;
    const nowMs = typeof performance === 'undefined' ? Date.now() : performance.now();
    if (nowMs - (this.last.get(id) ?? -Infinity) < SFX_COOLDOWNS[id] * 1000 || this.voices >= this.maxVoices) return false;
    this.last.set(id, nowMs); const at = ctx.currentTime + delay;
    const tone = (frequency: number, duration: number, gain: number, type: OscillatorType = 'sine', end = frequency) => {
      if (this.voices >= this.maxVoices) return;
      const oscillator = ctx.createOscillator(), amp = ctx.createGain(); this.voices++;
      oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at); oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, end), at + duration);
      amp.gain.setValueAtTime(.0001, at); amp.gain.exponentialRampToValueAtTime(Math.max(.0001, gain * this.volume), at + .012); amp.gain.exponentialRampToValueAtTime(.0001, at + duration);
      oscillator.connect(amp).connect(ctx.destination); oscillator.start(at); oscillator.stop(at + duration + .02); oscillator.onended = () => { this.voices = Math.max(0, this.voices - 1); };
    };
    const chord = (notes: number[], duration: number, gain: number, spacing = .055) => notes.forEach((note, i) => { const start = at + i * spacing; const oscillator = ctx.createOscillator(), amp = ctx.createGain(); if (this.voices >= this.maxVoices) return; this.voices++; oscillator.type = 'sine'; oscillator.frequency.value = note; amp.gain.setValueAtTime(.0001, start); amp.gain.exponentialRampToValueAtTime(gain * this.volume, start + .015); amp.gain.exponentialRampToValueAtTime(.0001, start + duration); oscillator.connect(amp).connect(ctx.destination); oscillator.start(start); oscillator.stop(start + duration + .02); oscillator.onended = () => { this.voices = Math.max(0, this.voices - 1); }; });
    switch (id) {
      case 'attack': tone(520, .055, .025, 'triangle', 390); break;
      case 'hit': tone(260, .045, .022, 'sine', 180); break;
      case 'kill': chord([330, 440], .11, .035, .025); break;
      case 'hurt': tone(145, .14, .05, 'triangle', 95); break;
      case 'coin': chord([740, 980], .1, .03, .04); break;
      case 'chest': chord([392, 523, 659, 784], .28, .045, .065); break;
      case 'levelUp': chord([330, 440, 554, 660], .36, .05, .085); break;
      case 'upgrade': chord([440, 554, 659], .2, .04, .055); break;
      case 'build': chord([196, 294, 392], .22, .045, .045); break;
      case 'confirm': tone(480, .06, .022, 'sine', 560); break;
      case 'error': tone(180, .13, .035, 'triangle', 145); break;
      case 'wave': chord([220, 294, 370], .28, .045, .07); break;
      case 'bossAppear': chord([110, 139, 165], .5, .055, .09); break;
      case 'bossDefeat': chord([262, 392, 523, 659], .55, .06, .105); break;
      case 'unlock': chord([349, 440, 523, 698], .42, .05, .08); break;
      case 'gameOver': chord([247, 196, 147, 110], .55, .055, .11); break;
    }
    return true;
  }
}

export const sfx = new SoundEffects();

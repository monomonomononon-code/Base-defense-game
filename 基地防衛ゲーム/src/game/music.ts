import type { Game } from './engine';
import { makeMusicBuffer, MUSIC, type MusicTrack } from './musicScore';
export const clampBgmVolume = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : MUSIC.volume;

/** Observes combat only; never changes enemies, cooldowns, rewards or the save. */
export class MusicDirector {
  private until = 0;
  private previousHp = 0;
  private previousCd = 0;
  private track: MusicTrack = 'normal';
  update(game: Game, worldMap: boolean): { track: MusicTrack; duck: boolean } {
    if (!game.overlay && !game.paused) {
      if (game.mode === 'base') { this.until = 0; this.track = game.waveActive ? 'battle' : 'normal'; }
      else {
        const threat = game.enemies.some(e => e.hp > 0 && (e.kind === 'boss' || Math.hypot(e.x - game.hero.x, e.y - game.hero.y) < (e.guard ? 360 : 400)));
        if (threat || game.hero.hp < this.previousHp || game.hero.cd > this.previousCd) this.until = game.clock + MUSIC.quietAfter;
        this.track = game.clock < this.until ? 'battle' : 'normal';
      }
    }
    this.previousHp = game.hero.hp; this.previousCd = game.hero.cd;
    return { track: worldMap ? 'normal' : this.track, duck: game.paused || game.overlay };
  }
}

type Channel = { source: AudioBufferSourceNode; gain: GainNode; from: number; target: number; start: number; end: number };
export class BackgroundMusic {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private channels: Partial<Record<MusicTrack, Channel>> = {};
  private preparing: Promise<void> | null = null;
  private disposed = false;
  private hidden = false;
  private volume = MUSIC.volume;
  private muted = false;
  private duck = false;
  private track: MusicTrack = 'normal';
  private masterTarget = -1;
  constructor(private createContext = () => {
    const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio unavailable');
    return new Ctor();
  }, private renderBuffer = makeMusicBuffer) {}
  get status() { return { track: this.track, ready: Object.keys(this.channels).length === 2, state: this.context?.state ?? 'locked', volume: this.volume, muted: this.muted, hidden: this.hidden }; }
  configure(volume: number, muted: boolean) { this.volume = clampBgmVolume(volume); this.muted = muted; this.updateMaster(); }
  // Called synchronously from pointerdown/touchend/keydown to satisfy mobile autoplay.
  unlock() {
    if (this.disposed || this.hidden) return Promise.resolve();
    try {
      if (!this.context) {
        this.context = this.createContext(); this.master = this.context.createGain(); this.master.gain.value = 0; this.master.connect(this.context.destination);
      }
      if (this.context.state !== 'running') void this.context.resume().catch(() => {});
      if (!this.preparing) this.preparing = this.prepare().catch(() => { this.preparing = null; });
      return this.preparing;
    } catch { return Promise.resolve(); }
  }
  private async prepare() {
    const context = this.context!;
    // Sequential and chunked synthesis avoids blocking touch input during startup.
    const normal = await this.renderBuffer(context, 'normal'), battle = await this.renderBuffer(context, 'battle');
    if (this.disposed) return;
    for (const [name, buffer] of [['normal', normal], ['battle', battle]] as const) {
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.loop = true; gain.gain.value = 0;
      source.connect(gain).connect(this.master!); source.start();
      this.channels[name] = { source, gain, from: 0, target: 0, start: 0, end: 0 };
    }
    this.applyTrack(); this.updateMaster();
  }
  setScene(track: MusicTrack, duck = false) {
    if (track !== this.track) { this.track = track; this.applyTrack(); }
    if (duck !== this.duck) { this.duck = duck; this.updateMaster(); }
  }
  private applyTrack() {
    const now = this.context?.currentTime ?? 0, duration = this.track === 'battle' ? MUSIC.battleFade : MUSIC.normalFade;
    for (const name of ['normal', 'battle'] as const) {
      const channel = this.channels[name]; if (!channel) continue;
      const fraction = channel.end > channel.start ? Math.max(0, Math.min(1, (now - channel.start) / (channel.end - channel.start))) : 1;
      const value = channel.from + (channel.target - channel.from) * fraction;
      const param = channel.gain.gain; param.cancelScheduledValues(now); param.setValueAtTime(value, now);
      channel.from = value; channel.target = name === this.track ? 1 : 0; channel.start = now; channel.end = now + duration;
      param.linearRampToValueAtTime(channel.target, channel.end);
    }
  }
  private updateMaster() {
    if (!this.context || !this.master) return;
    const target = this.hidden || this.muted ? 0 : this.volume * (this.duck ? MUSIC.duck : 1);
    if (target === this.masterTarget) return;
    this.masterTarget = target;
    this.master.gain.setTargetAtTime(target, this.context.currentTime, .035);
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden; this.updateMaster();
    if (!this.context) return;
    if (hidden) void this.context.suspend().catch(() => {});
    else void this.context.resume().then(() => { if (this.hidden) void this.context?.suspend().catch(() => {}); }).catch(() => {});
  }
  dispose() {
    this.disposed = true;
    for (const channel of Object.values(this.channels)) { channel.source.stop(); channel.source.disconnect(); channel.gain.disconnect(); }
    this.channels = {}; this.master?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
  }
}

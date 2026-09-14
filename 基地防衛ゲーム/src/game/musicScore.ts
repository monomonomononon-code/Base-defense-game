// Original score and additive instruments. No recordings, samples or external assets.
export type MusicTrack = 'normal' | 'battle';
export const MUSIC = { volume: .4, sampleRate: 22050, bars: 32, battleFade: 1, normalFade: 2.5, quietAfter: 8, duck: .45 };
export const TRACKS = { normal: { title: '朝露の小径', bpm: 96 }, battle: { title: '灯りを守る足音', bpm: 128 } };
type Instrument = 'pluck' | 'flute' | 'strings' | 'bass' | 'drum';
export interface Note { beat: number; midi: number; length: number; gain: number; instrument: Instrument }
const chords = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]];
// D–E–F#–A / F#–E–D, shared by both arrangements.
const phrases = [[74, 76, 78, 81], [78, 76, 74], [78, 81, 83, 81], [78, 76, 74], [74, 78, 81], [83, 81, 78], [79, 78, 76], [78, 76, 74]];
export function musicScore(track: MusicTrack): Note[] {
  const notes: Note[] = [], battle = track === 'battle';
  const add = (beat: number, midi: number, length: number, gain: number, instrument: Instrument) => notes.push({ beat, midi, length, gain, instrument });
  for (let bar = 0; bar < MUSIC.bars; bar++) {
    const chord = chords[Math.floor(bar / 2) % 4], beat = bar * 4;
    const steps = battle ? 8 : 4;
    for (let i = 0; i < steps; i++) add(beat + i * 4 / steps, chord[[0, 2, 1, 3, 2, 1, 3, 2][i]] + 12, battle ? .8 : 1.8, battle ? .065 : .075, 'pluck');
    add(beat, chord[0] - 12, 2.9, .07, 'bass');
    if (battle) { add(beat + 2, chord[1] - 12, 1.4, .055, 'bass'); for (let i = 0; i < 4; i++) add(beat + i, i % 2 ? 45 : 36, .3, i % 2 ? .05 : .07, 'drum'); }
    // Melody breathes for alternating bars; the second half adds a thin string bed.
    if (bar % 4 !== 3) phrases[bar % 8].forEach((midi, i) => add(beat + i * (battle ? .5 : .75), midi, battle ? .55 : .85, .065, 'flute'));
    if (bar >= 16 && bar < 28) for (const midi of chord.slice(1)) add(beat, midi + 12, 4.2, .009, 'strings');
  }
  return notes;
}

export function renderNote(data: Float32Array, note: Note, bpm: number, rate = MUSIC.sampleRate) {
  const seconds = note.length * 60 / bpm, start = Math.round(note.beat * 60 / bpm * rate), frames = Math.ceil(seconds * rate);
  const frequency = 440 * 2 ** ((note.midi - 69) / 12), tau = Math.PI * 2;
  for (let i = 0; i < frames; i++) {
    const t = i / rate, progress = t / seconds;
    let value: number;
    const release = Math.min(1, (seconds - t) / .045);
    if (note.instrument === 'drum') value = Math.sin(tau * (frequency * t + 6 * (1 - Math.exp(-t * 35)))) * Math.exp(-t * 25) * Math.min(1, t / .004);
    else {
      const phase = tau * frequency * t;
      const attack = Math.min(1, t / (note.instrument === 'strings' ? .25 : note.instrument === 'flute' ? .04 : .006));
      if (note.instrument === 'pluck') value = (Math.sin(phase) + .28 * Math.sin(phase * 2) * Math.exp(-t * 6) + .12 * Math.sin(phase * 3) * Math.exp(-t * 10)) * Math.exp(-progress * 4) * attack;
      else if (note.instrument === 'strings') value = (Math.sin(phase) + .2 * Math.sin(phase * 1.003)) * Math.sin(Math.PI * progress) * attack;
      else if (note.instrument === 'flute') value = (Math.sin(phase + .012 * Math.sin(tau * 4.6 * t)) + .1 * Math.sin(2 * phase)) * Math.sin(Math.PI * progress) * attack;
      else value = Math.sin(phase) * Math.exp(-progress * 3) * attack;
    }
    // Wrap release tails into the next cycle for a continuous seam.
    data[(start + i) % data.length] += value * release * note.gain;
  }
}

export async function makeMusicBuffer(context: BaseAudioContext, track: MusicTrack) {
  const bpm = TRACKS[track].bpm;
  const buffer = context.createBuffer(1, Math.round(MUSIC.bars * 4 * 60 / bpm * MUSIC.sampleRate), MUSIC.sampleRate);
  const data = buffer.getChannelData(0), notes = musicScore(track);
  for (let i = 0; i < notes.length; i++) {
    renderNote(data, notes[i], bpm);
    if (i % 16 === 15) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return buffer;
}

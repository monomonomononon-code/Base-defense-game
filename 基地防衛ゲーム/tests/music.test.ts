import test from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundMusic, MusicDirector } from '../src/game/music';
import { MUSIC, TRACKS, musicScore, renderNote } from '../src/game/musicScore';
import { Game } from '../src/game/engine';
import { newSave, parseSave } from '../src/game/state';
import { sfx } from '../src/game/audio';

test('old saves migrate BGM independently of SE and preserve progression', () => {
  const original = newSave(); original.level = 33; original.settings.sfxVolume = .2; original.settings.sfxMuted = true;
  const old = JSON.parse(JSON.stringify(original)); delete old.settings.bgmVolume; delete old.settings.bgmMuted;
  const restored = parseSave(JSON.stringify(old));
  assert.equal(restored.settings.bgmVolume, .4); assert.equal(restored.settings.bgmMuted, false); assert.equal(restored.level, 33);
  restored.settings.bgmVolume = .7; restored.settings.bgmMuted = true;
  assert.deepEqual(parseSave(JSON.stringify(restored)), restored);
  old.settings.bgmVolume = -5; assert.equal(parseSave(JSON.stringify(old)).settings.bgmVolume, 0);
  old.settings.bgmVolume = 5; assert.equal(parseSave(JSON.stringify(old)).settings.bgmVolume, 1);
  old.settings.bgmVolume = 'broken'; assert.equal(parseSave(JSON.stringify(old)).settings.bgmVolume, .4);
  assert.equal(restored.settings.sfxVolume, .2); assert.equal(restored.settings.sfxMuted, true);
});

test('music follows waves, maps, actual expedition danger and eight seconds of quiet', () => {
  const g = new Game(newSave(), () => {}, () => {}), director = new MusicDirector();
  assert.equal(director.update(g, false).track, 'normal');
  g.waveActive = true; assert.equal(director.update(g, false).track, 'battle');
  g.overlay = true; assert.deepEqual(director.update(g, true), {track:'normal',duck:true});
  assert.deepEqual(director.update(g, false), {track:'battle',duck:true});
  g.overlay = false; g.waveActive = false; assert.equal(director.update(g, false).track, 'normal');
  g.mode = 'expedition'; g.spawn('elite', {x:g.hero.x + 500, y:g.hero.y}, 'event');
  assert.equal(director.update(g, false).track, 'normal', 'unengaged distant guards must not trigger music');
  g.enemies[0].x = g.hero.x + 100; assert.equal(director.update(g, false).track, 'battle');
  g.enemies = []; g.clock = 7; assert.equal(director.update(g, false).track, 'battle');
  g.clock = 9; assert.equal(director.update(g, false).track, 'normal');
  g.hero.hp--; assert.equal(director.update(g, false).track, 'battle');
  g.clock += 9; director.update(g, false); g.spawn('boss', {x:1500,y:1500});
  assert.equal(director.update(g, false).track, 'battle');
  g.enemies = []; g.mode = 'base'; assert.equal(director.update(g, false).track, 'normal');
  g.endless = 'defense'; g.waveActive = true; assert.equal(director.update(g, false).track, 'battle');
});

test('two original scores have finite quiet waveforms and continuous loop seams', () => {
  for (const name of ['normal', 'battle'] as const) {
    const rate = 8000, duration = MUSIC.bars * 4 * 60 / TRACKS[name].bpm;
    assert.equal(duration, name === 'normal' ? 80 : 60);
    const data = new Float32Array(duration * rate), notes = musicScore(name);
    notes.forEach(note => renderNote(data, note, TRACKS[name].bpm, rate));
    let peak = 0, square = 0;
    for (const value of data) { assert.ok(Number.isFinite(value)); peak = Math.max(peak, Math.abs(value)); square += value * value; }
    assert.ok(peak < .6 && peak > .05); assert.ok(Math.sqrt(square / data.length) > .01);
    assert.ok(Math.abs(data[0] - data.at(-1)!) < .025, 'no abrupt waveform jump at loop seam');
    assert.equal(notes.some(note => note.instrument === 'drum'), name === 'battle');
    assert.deepEqual(notes.filter(n => n.instrument === 'flute').slice(0,4).map(n=>n.midi), [74,76,78,81]);
  }
});

class Param {
  value = 0; ramps: number[][] = []; targets: number[] = [];
  setValueAtTime(value: number) { this.value = value; }
  cancelScheduledValues() {}
  linearRampToValueAtTime(value: number, end: number) { this.ramps.push([value,end]); }
  setTargetAtTime(value: number) { this.targets.push(value); }
}
function audioMock() {
  const gains: {gain:Param;connect:(x:unknown)=>unknown;disconnect:()=>void}[] = [];
  const sources: {loop:boolean;buffer:unknown;starts:number;stops:number;connect:(x:unknown)=>unknown;start:()=>void;stop:()=>void;disconnect:()=>void}[] = [];
  const context = { currentTime:0, state:'suspended', destination:{}, resumes:0,
    resume() { this.state='running'; this.resumes++; return Promise.resolve(); },
    suspend() { this.state='suspended'; return Promise.resolve(); }, close() { this.state='closed'; return Promise.resolve(); },
    createGain() { const node = {gain:new Param(),connect:(x:unknown)=>x,disconnect:()=>{}}; gains.push(node); return node; },
    createBufferSource() { const node = {loop:false,buffer:null as unknown,starts:0,stops:0,connect:(x:unknown)=>x,start(){this.starts++;},stop(){this.stops++;},disconnect:()=>{}}; sources.push(node); return node; },
  };
  return {context,gains,sources};
}
test('gesture startup, continuous sources, interruption-safe fades, mute and background lifecycle', async () => {
  const {context,gains,sources} = audioMock(), se = {...sfx.settings};
  const music = new BackgroundMusic(()=> context as unknown as AudioContext, async()=>({} as AudioBuffer));
  assert.equal(music.status.state, 'locked');
  await Promise.all([music.unlock(),music.unlock()]);
  assert.equal(sources.length, 2); assert.ok(sources.every(s=>s.loop && s.starts===1));
  music.setScene('battle'); assert.deepEqual(gains[2].gain.ramps.at(-1), [1,1]);
  context.currentTime=.5; music.setScene('normal');
  assert.equal(gains[2].gain.value,.5, 'mid-fade switch continues from current gain');
  assert.deepEqual(gains[2].gain.ramps.at(-1), [0,3]);
  music.configure(.8,false); music.setScene('normal',true); assert.equal(gains[0].gain.targets.at(-1),.8*MUSIC.duck);
  music.configure(.8,true); assert.equal(gains[0].gain.targets.at(-1),0);
  music.configure(0,false); assert.equal(gains[0].gain.targets.at(-1),0);
  music.setHidden(true); assert.equal(context.state,'suspended');
  music.setHidden(false); await music.unlock(); assert.equal(context.state,'running');
  assert.ok(sources.every(s=>s.starts===1)); assert.deepEqual(sfx.settings,se);
  music.dispose(); assert.equal(context.state,'closed'); assert.ok(sources.every(s=>s.stops===1));
});
test('unsupported audio and resume denial never break gameplay or reject to the UI', async () => {
  const unavailable = new BackgroundMusic(()=>{throw new Error('unsupported');}); await unavailable.unlock(); unavailable.dispose();
  const {context} = audioMock(); context.resume = () => Promise.reject(new Error('gesture required'));
  const music = new BackgroundMusic(()=>context as unknown as AudioContext, async()=>({} as AudioBuffer));
  await music.unlock(); music.setHidden(false); music.dispose();
});

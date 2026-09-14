import { BackgroundMusic } from '../src/game/music';
const output = document.querySelector('#result')!;
let context: AudioContext;
const sources: AudioBufferSourceNode[] = [], gains: GainNode[] = [];
let analyser: AnalyserNode;
const music = new BackgroundMusic(() => {
  context = new AudioContext(); analyser = context.createAnalyser();
  const createSource = context.createBufferSource.bind(context), createGain = context.createGain.bind(context);
  context.createBufferSource = () => { const source = createSource(); sources.push(source); return source; };
  context.createGain = () => { const gain = createGain(); if (!gains.length) gain.connect(analyser); gains.push(gain); return gain; };
  return context;
});
// Analyser is a side branch with no destination, so it cannot double the output.
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const rms = () => { const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length); };
const report = (message: string) => { output.textContent += '\n' + message; };
const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); report('PASS ' + message); };
document.querySelector('#run')!.addEventListener('click', async () => {
  output.textContent = '実 AudioContext テスト中…';
  try {
    const start = performance.now(); await music.unlock();
    check(music.status.ready && context.state === 'running', `タップで2曲生成・再生 (${Math.round(performance.now()-start)}ms)`);
    check(sources.length === 2 && sources.every(source=>source.loop), '通常80秒 / 戦闘60秒のネイティブループ');
    check(sources[0].buffer?.duration===80 && sources[1].buffer?.duration===60, '32小節の尺');
    await wait(2700); check(rms() > .0001, '通常曲の実音声出力');
    music.setScene('battle'); await wait(1100);
    check(gains[1].gain.value < .01 && gains[2].gain.value > .99 && rms() > .0001, '戦闘曲へ1秒フェード・実音声出力');
    music.setScene('normal'); await wait(2700);
    check(gains[1].gain.value > .99 && gains[2].gain.value < .01, '通常曲へ2.5秒フェード');
    music.configure(.15,false); await wait(400); check(Math.abs(gains[0].gain.value-.15)<.001, '独立音量15%');
    music.configure(.15,true); await wait(450); check(rms()<.00001, 'ミュートで実音声出力ゼロ');
    music.configure(0,false); await wait(150); check(rms()<.00001, '音量0で無音');
    music.configure(.4,false); music.setHidden(true); await wait(100); check(String(context.state)==='suspended','非表示時に停止');
    music.setHidden(false); await music.unlock(); await wait(150); check(String(context.state)==='running','復帰後に再開');
    check(sources.length===2,'切替・復帰で音源を重複生成しない');
    report('完了：全項目成功 / viewport ' + innerWidth);
  } catch (error) { report('FAIL ' + error); }
});
for (const track of ['normal','battle'] as const) document.querySelector('#'+track)!.addEventListener('click',()=>{void music.unlock();music.configure(.4,false);music.setScene(track);});
document.querySelector('#mute')!.addEventListener('click',()=>music.configure(.4,true));
document.addEventListener('visibilitychange',()=>music.setHidden(document.hidden));
window.addEventListener('pagehide',()=>music.dispose());

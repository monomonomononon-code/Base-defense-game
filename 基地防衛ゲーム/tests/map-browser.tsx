import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Game,distance,type Vec} from '../src/game/engine';
import {newSave} from '../src/game/state';
import {render,drawMinimap} from '../src/game/render';
import {routeWaypoints,walkable} from '../src/game/expeditionMap';
import RouteMap from '../src/RouteMap';
import '../src/style.css';

const save=newSave();save.expeditionUnlocked=true;save.level=8;save.nextRaid=1e9;
const game=new Game(save,()=>{},()=>{});game.persist=()=>{};
function Preview(){
  const canvas=useRef<HTMLCanvasElement>(null),mini=useRef<HTMLCanvasElement>(null),path=useRef<Vec[]>([]);
  const [pattern,setPattern]=useState(0),[status,setStatus]=useState('道を選んでください'),[map,setMap]=useState(false);
  useEffect(()=>{game.returnHome();game.travel(0);game.worldSeed=pattern;game.makeWorld();game.enemies=[];game.spawnClock=1e9;game.hero.hp=game.stats.hp;path.current=[];game.joystick={x:0,y:0};setStatus('道を選んでください');},[pattern]);
  useEffect(()=>{let id=0,last=performance.now();const frame=(now:number)=>{
    const dt=Math.min(.05,(now-last)/1000);last=now;game.overlay=map;
    if(path.current.length){while(path.current.length&&distance(game.hero,path.current[0])<8)path.current.shift();const next=path.current[0];if(next){const d=distance(game.hero,next);game.joystick={x:(next.x-game.hero.x)/d,y:(next.y-game.hero.y)/d};}else{game.joystick={x:0,y:0};setStatus('到着：道・橋・合流点を通って移動しました');}}
    game.update(dt);const c=canvas.current;if(c){const w=c.parentElement!.clientWidth;c.width=w*2;c.height=960;const ctx=c.getContext('2d')!;ctx.setTransform(2,0,0,2,0,0);render(ctx,game,w,480);}
    if(mini.current)drawMinimap(mini.current.getContext('2d')!,game);
    if(!walkable(game.hero,game.expeditionMap!))setStatus('FAIL：通行範囲外');
    id=requestAnimationFrame(frame);
  };id=requestAnimationFrame(frame);return()=>cancelAnimationFrame(id);},[map]);
  const go=(id:'resource1'|'chest'|'event'|'boss')=>{path.current=routeWaypoints(game.hero,game.expeditionMap!.nodes[id],game.expeditionMap!);setStatus(`${id}へ道沿いに移動中（${path.current.length}区間）`);};
  return <main style={{maxWidth:900,margin:'auto',padding:10}}><h2>遠征地形の確認</h2><p style={{fontSize:12}}>開発用：実エンジン・描画を使用。戦闘停止、保存なし。</p><div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>{[0,1,2,3].map(i=><button className="subtle-btn" onClick={()=>setPattern(i)} key={i}>地形{i+1}</button>)}</div><div className="game-stage" style={{height:480}}><canvas ref={canvas} style={{width:'100%',height:480}}/><div className="minimap expedition-mini"><canvas ref={mini} width={120} height={120}/><button className="route-map-open" onClick={()=>setMap(true)}>ルートを見る</button></div></div><p role="status">{status}</p><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button className="subtle-btn" onClick={()=>go('resource1')}>資源へ歩く</button><button className="subtle-btn" onClick={()=>go('chest')}>宝箱へ歩く</button><button className="subtle-btn" onClick={()=>go('event')}>発見へ歩く</button><button className="subtle-btn" onClick={()=>go('boss')}>主の広場へ歩く</button></div>{map&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-label="遠征ルート"><button className="subtle-btn" onClick={()=>setMap(false)}>地図を閉じる</button><RouteMap game={game}/></section></div>}</main>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Preview/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());

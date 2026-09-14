import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpeditionMap, distanceToRoad, patrolPosition, EXPLORATION, MAP_TEMPLATE_COUNT, walkable, clearPath, moveOnMap, routeWaypoints } from '../src/game/expeditionMap';
import { Game, distance } from '../src/game/engine';
import { newSave } from '../src/game/state';

test('all map variants connect rewards, contain loops and event dead ends, with longer resource routes',()=>{
  const names=new Set<string>(), layouts=new Set<string>();
  for(let seed=0;seed<88;seed++) {
    const map=createExpeditionMap(seed,seed%11); names.add(map.name); layouts.add(JSON.stringify(map.nodes));
    const seen=new Set<string>(['portal']);
    for(let pass=0;pass<12;pass++) for(const r of map.roads) { if(seen.has(r.from)) seen.add(r.to); if(seen.has(r.to)) seen.add(r.from); }
    assert.equal(seen.size,Object.keys(map.nodes).length);
    assert.ok(map.roads.length-Object.keys(map.nodes).length+1>=2,'at least two independent loops');
    assert.equal(map.roads.filter(r=>r.from==='event'||r.to==='event').length,1);
    const length=(kind:string)=>map.roads.filter(r=>r.kind===kind).reduce((sum,r)=>sum+distance(map.nodes[r.from],map.nodes[r.to]),0);
    assert.ok(length('resource')>length('direct')*1.5);
    for(const p of Object.values(map.nodes)) {assert.ok(p.x>=180&&p.x<=1420&&p.y>=180&&p.y<=1400);assert.equal(distanceToRoad(p,map),0);}
    assert.deepEqual(map,createExpeditionMap(seed,seed%11));
  }
  assert.equal(names.size,MAP_TEMPLATE_COUNT);assert.equal(layouts.size,88);
});

test('all destinations are physically reachable, walls stop walking and dash, detours cannot be crossed directly',()=>{
  for(let seed=0;seed<32;seed++) {
    const map=createExpeditionMap(seed,seed%11);
    for(const target of Object.values(map.nodes)) {
      const path=routeWaypoints(map.nodes.portal,target,map);assert.ok(path.length);
      let p={...map.nodes.portal};
      for(const step of path) {assert.ok(clearPath(p,step,map));const d=distance(p,step);const next=moveOnMap(p,step.x-p.x,step.y-p.y,map);assert.ok(distance(next,step)<.001,`seed ${seed}, distance ${d}`);p=next;}
    }
    assert.equal(clearPath(map.nodes.portal,map.nodes.chest,map),false,'treasure requires its branch');
    const p=map.nodes.resource1, blocked=moveOnMap(p,-2000,0,map);assert.ok(walkable(blocked,map));assert.ok(blocked.x>=35);
    assert.equal(walkable({x:70,y:70},map),false);
  }
});

test('engine movement, pursuers and projectiles respect expedition terrain',()=>{
  const save=newSave();save.expeditionUnlocked=true;const g=new Game(save,()=>{},()=>{});g.persist=()=>{};g.travel(0);
  const map=g.expeditionMap!;g.enemies=[];g.spawnClock=999;g.hero.invulnerable=999;
  g.hero.x=map.nodes.resource1.x;g.hero.y=map.nodes.resource1.y;g.keys.add('a');g.dash();
  for(let i=0;i<100;i++){g.update(.05);assert.ok(walkable(g.hero,map));}g.keys.clear();
  Object.assign(g.hero,map.nodes.chest);g.spawn('hunter',map.nodes.resource1);const enemy=g.enemies[0];enemy.hp--;
  let best=distance(enemy,g.hero);
  for(let i=0;i<700;i++){g.hero.invulnerable=100;g.hero.cd=100;g.update(.05);assert.ok(walkable(enemy,map));best=Math.min(best,distance(enemy,g.hero));}
  assert.ok(best<100,'pursuer uses a connecting road rather than sticking to a wall');
  const p=map.nodes.resource1;g.bullets=[{...p,vx:p.x<800?-4000:4000,vy:0,damage:1,life:9,enemy:false,hero:true,splash:0,color:'#fff'}];g.update(.05);
  assert.equal(g.bullets.length,0,'shot into the outer forest stops at terrain');
});

test('weighted patrols favor dangerous roads without spawning on player or overcrowded areas',()=>{
  const map=createExpeditionMap(0,0), hero=map.nodes.portal;
  const counts=new Map<number,number>();
  for(let i=0;i<1000;i++) {const p=patrolPosition(map,hero,[],i/1000)!;assert.ok(distance(p,hero)>EXPLORATION.spawnClearance); const n=map.patrols.findIndex(a=>distance(a,p)<1);counts.set(n,(counts.get(n)??0)+1);}
  const average=(weight:number)=>{const ps=map.patrols.map((p,i)=>({p,i})).filter(({p})=>p.weight===weight&&distance(p,hero)>EXPLORATION.spawnClearance);return ps.reduce((n,{i})=>n+(counts.get(i)??0),0)/ps.length;};
  assert.ok(average(4)>average(1)*3);assert.ok(average(3)>average(1)*2);
  const crowd=map.patrols.flatMap(p=>Array.from({length:EXPLORATION.localCap},()=>({...p})));
  assert.equal(patrolPosition(map,hero,crowd,.5),undefined);
});

test('travel preserves reward nodes and guards, varies maps and places unlocked boss at the marked clearing',()=>{
  const save=newSave();save.expeditionUnlocked=true;
  const g=new Game(save,()=>{},()=>{});g.persist=()=>{};
  g.travel(2);const first=JSON.stringify(g.expeditionMap?.nodes);
  assert.deepEqual(g.points.map(p=>p.type).sort(),['camp','chest','event','portal','resource','resource']);
  assert.equal(g.enemies.filter(e=>e.kind==='elite').length,3);
  assert.ok(g.points.every(p=>distanceToRoad(p,g.expeditionMap!)===0));
  const bossPoint={...g.expeditionMap!.nodes.boss};g.expeditionKills=g.bossTarget;g.update(.05);
  const boss=g.enemies.find(e=>e.kind==='boss')!;assert.deepEqual({x:boss.x,y:boss.y},bossPoint);
  const before={...boss};g.update(.05);assert.equal(boss.x,before.x);assert.equal(boss.y,before.y);
  g.returnHome();assert.equal(g.expeditionMap,null);g.travel(2);assert.notEqual(JSON.stringify(g.expeditionMap?.nodes),first);
  g.returnHome();g.save.level=55;g.save.completed=true;assert.ok(g.startEndless('expedition'));
  assert.ok(g.expeditionMap);assert.equal(g.points.length,6);
});

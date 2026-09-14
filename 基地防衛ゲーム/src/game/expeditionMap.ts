export type MapVec = { x: number; y: number };
export type RouteKind = 'direct' | 'resource' | 'treasure' | 'event' | 'link';
export type Surface = 'bridge' | 'marsh' | 'forest' | 'ruins';
export const EXPLORATION = { roadWidth: 150, clearingRadius: 105, bossRadius: 300, patrolRange: 310, spawnClearance: 240, localCap: 4 };
export const ROUTE_COLORS: Record<RouteKind, string> = { direct: '#cc927a', resource: '#a8c59c', treasure: '#ddbf7c', event: '#c7b9ce', link: '#c2ba94' };
type NodeId = 'portal' | 'fork' | 'center' | 'boss' | 'resource1' | 'resource2' | 'chest' | 'event' | 'camp' | 'west' | 'east';
export type ExpeditionMap = { name: string; nodes: Record<NodeId, MapVec>; roads: { from: NodeId; to: NodeId; kind: RouteKind; surface: Surface }[]; patrols: (MapVec & { weight: number })[] };
// Compact graphs, not mazes: two loops, a shortcut and one rewarding dead end.
const templates: { name: string; points: [number, number][]; links: [NodeId, NodeId][] }[] = [
  { name: 'ふたつの橋', points: [[800,1340],[800,1120],[800,760],[800,260],[280,1040],[290,480],[1240,710],[1330,310],[870,570],[270,760],[1270,1060]], links: [['west','center'],['chest','boss']] },
  { name: '三叉の森道', points: [[800,1340],[800,1110],[670,730],[910,260],[290,1050],[260,410],[1280,620],[1370,330],[810,490],[290,700],[1260,1000]], links: [['resource2','center'],['east','center']] },
  { name: '環状の廃道', points: [[800,1340],[800,1140],[930,770],[790,250],[300,1080],[270,470],[1280,680],[260,250],[850,520],[230,780],[1300,1060]], links: [['west','center'],['chest','boss']] },
  { name: '湿原の合流点', points: [[800,1340],[800,1100],[780,720],[1040,250],[270,1020],[330,440],[1300,670],[1390,570],[940,510],[230,710],[1250,1030]], links: [['resource2','center'],['chest','center']] },
];
export const MAP_TEMPLATE_COUNT = templates.length;
const ids: NodeId[] = ['portal','fork','center','boss','resource1','resource2','chest','event','camp','west','east'];
export function createExpeditionMap(seed: number, region: number): ExpeditionMap {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state,1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const t = templates[(seed >>> 0) % templates.length], mirror = ((seed >>> 2) & 1) === 1;
  const nodes = {} as ExpeditionMap['nodes'];
  ids.forEach((id,i) => { const [x,y] = t.points[i]; nodes[id] = { x: id === 'portal' ? x : (mirror ? 1600-x : x) + (random()-.5)*40, y: id === 'portal' ? y : y + (random()-.5)*40 }; });
  const roads: ExpeditionMap['roads'] = [];
  const add = (from: NodeId, to: NodeId, kind: RouteKind, surface: Surface) => roads.push({from,to,kind,surface});
  add('portal','fork','link','forest');
  add('fork','center','direct','ruins'); add('center','camp','direct','ruins'); add('camp','boss','direct','ruins');
  add('fork','resource1','resource','forest'); add('resource1','west','resource','forest');
  add('west','resource2','resource',region % 2 ? 'marsh' : 'bridge'); add('resource2','boss','resource','forest');
  add('fork','east','treasure','forest'); add('east','chest','treasure','bridge');
  add('chest','event','event',region % 2 ? 'forest' : 'marsh');
  if (t.name === '環状の廃道') { roads.pop(); add('resource2','event','event','ruins'); }
  for (const [a,b] of t.links) add(a,b,'link','forest');
  const patrols: ExpeditionMap['patrols'] = [];
  for (const road of roads.filter(r => r.kind !== 'event' && !(r.from === 'portal'))) {
    const a=nodes[road.from], b=nodes[road.to];
    patrols.push({ x:(a.x+b.x)/2,y:(a.y+b.y)/2,weight:road.kind === 'direct' ? 4 : road.kind === 'treasure' ? 3 : 1 });
  }
  return {name:t.name,nodes,roads,patrols};
}
export function distanceToRoad(p: MapVec, map: ExpeditionMap) {
  return Math.min(...map.roads.map(r => {
    const a=map.nodes[r.from],b=map.nodes[r.to],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  }));
}
/** Allocate the existing spawn budget across roads, away from the player's feet. */
export function patrolPosition(map: ExpeditionMap, hero: MapVec, enemies: MapVec[], roll: number): MapVec | undefined {
  const candidates=map.patrols.filter(p => Math.hypot(p.x-hero.x,p.y-hero.y)>EXPLORATION.spawnClearance && enemies.filter(e=>Math.hypot(e.x-p.x,e.y-p.y)<140).length<EXPLORATION.localCap);
  let choice=roll*candidates.reduce((sum,p)=>sum+p.weight,0);
  for(const p of candidates) { choice-=p.weight; if(choice<0) return {x:p.x,y:p.y}; }
  return undefined;
}

/** The road graph is also the collision geometry, so rendered forks cannot be bypassed. */
export function walkable(p: MapVec, map: ExpeditionMap, radius = 14) {
  return p.x>=35 && p.x<=1565 && p.y>=35 && p.y<=1565 &&
    (Object.entries(map.nodes).some(([id,n])=>Math.hypot(n.x-p.x,n.y-p.y)<=(id==='boss'?EXPLORATION.bossRadius:EXPLORATION.clearingRadius)-radius) || distanceToRoad(p,map)<=EXPLORATION.roadWidth/2-radius);
}
export function clearPath(a: MapVec,b: MapVec,map: ExpeditionMap,radius=14) {
  if(!walkable(a,map,radius)||!walkable(b,map,radius))return false;
  const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;if(len2<1e-12)return true;
  const intervals:[number,number][]=[];
  const circle=(p:MapVec,r:number)=>{
    const px=a.x-p.x,py=a.y-p.y,v=px*dx+py*dy,d=v*v-len2*(px*px+py*py-r*r);
    if(d>=0){const root=Math.sqrt(d);intervals.push([Math.max(0,(-v-root)/len2),Math.min(1,(-v+root)/len2)]);}
  };
  for(const [id,p] of Object.entries(map.nodes))circle(p,(id==='boss'?EXPLORATION.bossRadius:EXPLORATION.clearingRadius)-radius);
  for(const road of map.roads){
    const p=map.nodes[road.from],q=map.nodes[road.to],len=Math.hypot(q.x-p.x,q.y-p.y),ux=(q.x-p.x)/len,uy=(q.y-p.y)/len,r=EXPLORATION.roadWidth/2-radius;
    circle(p,r);circle(q,r);
    let lo=0,hi=1;
    for(const [origin,velocity,min,max] of [[(a.x-p.x)*ux+(a.y-p.y)*uy,dx*ux+dy*uy,0,len],[-(a.x-p.x)*uy+(a.y-p.y)*ux,-dx*uy+dy*ux,-r,r]]){
      if(Math.abs(velocity)<1e-12){if(origin<min||origin>max)hi=-1;}
      else {const t1=(min-origin)/velocity,t2=(max-origin)/velocity;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
    }
    if(lo<=hi)intervals.push([lo,hi]);
  }
  intervals.sort((x,y)=>x[0]-y[0]);let reached=0;
  for(const [lo,hi] of intervals){if(hi<lo)continue;if(lo>reached+1e-7)return false;reached=Math.max(reached,hi);if(reached>=1-1e-7)return true;}
  return false;
}
export function moveOnMap(p: MapVec,dx: number,dy: number,map: ExpeditionMap,radius=14) {
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/8));
  const out={...p};
  for(let i=0;i<steps;i++) {
    const next={x:out.x+dx/steps,y:out.y+dy/steps};
    if(walkable(next,map,radius)) {out.x=next.x;out.y=next.y;}
    else {if(walkable({x:next.x,y:out.y},map,radius))out.x=next.x;if(walkable({x:out.x,y:next.y},map,radius))out.y=next.y;}
  }
  return out;
}
/** Tiny visibility graph: usable for pursuers and test players, with no grid or maze search. */
export function routeWaypoints(start: MapVec,target: MapVec,map: ExpeditionMap,radius=14): MapVec[] {
  if(clearPath(start,target,map,radius))return [target];
  const points=[start,...Object.values(map.nodes),target], end=points.length-1;
  const costs=points.map(()=>Infinity), prev=points.map(()=>-1),seen=new Set<number>();costs[0]=0;
  // Fixed road edges plus visible entry/exit points; all nodes are joined by the template.
  const edges=map.roads.map(r=>[ids.indexOf(r.from)+1,ids.indexOf(r.to)+1]);
  for(let i=1;i<end;i++) {if(clearPath(start,points[i],map,radius))edges.push([0,i]);if(clearPath(points[i],target,map,radius))edges.push([i,end]);}
  while(!seen.has(end)) {
    let u=-1;for(let i=0;i<points.length;i++)if(!seen.has(i)&&(u<0||costs[i]<costs[u]))u=i;
    if(u<0||!Number.isFinite(costs[u]))return [];
    seen.add(u);
    for(const [a,b] of edges) {const v=a===u?b:b===u?a:-1;if(v<0||seen.has(v))continue;
      const cost=costs[u]+Math.hypot(points[v].x-points[u].x,points[v].y-points[u].y);if(cost<costs[v]){costs[v]=cost;prev[v]=u;}}
  }
  const route:MapVec[]=[];for(let i=end;i>0;i=prev[i])route.unshift(points[i]);return route;
}

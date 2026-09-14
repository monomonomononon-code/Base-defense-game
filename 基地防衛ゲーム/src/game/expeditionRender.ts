import { EXPLORATION, ROUTE_COLORS, walkable, type ExpeditionMap } from './expeditionMap';

export function drawExpeditionRoads(ctx: CanvasRenderingContext2D, map: ExpeditionMap, scale = 1) {
  ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
  if(scale===1) for(const [id,p] of Object.entries(map.nodes)) {
    const radius=id==='boss'?EXPLORATION.bossRadius:EXPLORATION.clearingRadius;
    ctx.fillStyle='#283d32';ctx.beginPath();ctx.arc(p.x,p.y,radius+6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#929b77';ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();
  }
  for (const r of map.roads) {
    const a=map.nodes[r.from],b=map.nodes[r.to];
    ctx.beginPath(); ctx.moveTo(a.x*scale,a.y*scale); ctx.lineTo(b.x*scale,b.y*scale);
    ctx.strokeStyle=scale===1 ? '#384b3560' : '#16291e'; ctx.lineWidth=scale===1 ? EXPLORATION.roadWidth+12 : 5; ctx.stroke();
    ctx.strokeStyle=ROUTE_COLORS[r.kind]; ctx.globalAlpha=scale===1 ? .65 : 1; ctx.lineWidth=scale===1 ? EXPLORATION.roadWidth : 2.4; ctx.stroke(); ctx.globalAlpha=1;
    if(scale!==1) continue;
    const x=(a.x+b.x)/2,y=(a.y+b.y)/2,angle=Math.atan2(b.y-a.y,b.x-a.x);
    ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
    if(r.surface==='bridge') {
      ctx.fillStyle='#739f9d'; ctx.fillRect(-38,-125,76,250);
      ctx.fillStyle='#8a7858'; ctx.fillRect(-58,-75,116,150);
      ctx.strokeStyle='#d6c79f';ctx.lineWidth=3;
      for(let i=-50;i<=50;i+=12) {ctx.beginPath();ctx.moveTo(i,-72);ctx.lineTo(i,72);ctx.stroke();}
      ctx.strokeStyle='#5d6146';ctx.lineWidth=6;for(const side of [-78,78]) {ctx.beginPath();ctx.moveTo(-62,side);ctx.lineTo(62,side);ctx.stroke();}
    } else if(r.surface==='marsh') {
      ctx.fillStyle='#587f6b70'; ctx.beginPath(); ctx.ellipse(0,0,80,57,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#c2c49c';for(let i=-50;i<=50;i+=25) {ctx.beginPath();ctx.ellipse(i,0,9,16,0,0,Math.PI*2);ctx.fill();}
    } else if(r.surface==='ruins') {
      ctx.fillStyle='#d3c9ad70';for(let i=-60;i<=60;i+=28) ctx.fillRect(i,-18+(i%3)*3,18,26);
    } else {
      ctx.fillStyle='#44664b55';for(const side of [-89,89]) for(let i=-55;i<60;i+=28) {ctx.beginPath();ctx.ellipse(i,side,17,12,0,0,Math.PI*2);ctx.fill();}
    }
    ctx.restore();
  }
  if(scale===1) {
    // Low thickets and stone edges explain the collision boundary without hiding actors.
    for(const road of map.roads) {
      const a=map.nodes[road.from],b=map.nodes[road.to],length=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
      for(let d=30;d<length;d+=65) for(const side of [-1,1]) {
        const p={x:a.x+(b.x-a.x)*d/length+nx*side*94,y:a.y+(b.y-a.y)*d/length+ny*side*94};
        if(walkable(p,map,0))continue;
        ctx.fillStyle=road.surface==='ruins'?'#8a9580':'#43674c';ctx.beginPath();
        ctx.moveTo(p.x-13,p.y+7);ctx.lineTo(p.x-9,p.y-9);ctx.lineTo(p.x+7,p.y-14);ctx.lineTo(p.x+15,p.y+5);ctx.closePath();ctx.fill();
        ctx.fillStyle=road.surface==='ruins'?'#b0b69b':'#638660';ctx.beginPath();ctx.ellipse(p.x-2,p.y-8,10,6,0,0,Math.PI*2);ctx.fill();
      }
    }
    for(const [id,text] of [['fork','赤：近道 / 緑：資源 / 金：宝箱'],['boss','主の広場'],['event','袋小路の発見']] as const) {
      const p=map.nodes[id];ctx.font='600 13px system-ui';ctx.textAlign='center';ctx.fillStyle='#293f32d9';ctx.fillRect(p.x-110,p.y+35,220,26);ctx.fillStyle='#f0e5c4';ctx.fillText(text,p.x,p.y+53);
    }
  }
  ctx.restore();
}

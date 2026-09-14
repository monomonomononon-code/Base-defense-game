import { BALANCE, ENEMIES, REGIONS } from './data';
import { baseMaxHp } from './state';
import { Game, clamp, distance } from './engine';
import { drawExpeditionRoads } from './expeditionRender';

export function render(ctx: CanvasRenderingContext2D, game: Game, width: number, height: number) {
  const g = game; const s = Math.max(.62, Math.min(1.12, width / 940));
  let cx = g.mode === 'base' ? 800 + (g.hero.x - 800) * .72 : g.hero.x;
  let cy = g.mode === 'base' ? 860 + (g.hero.y - 940) * .72 : g.hero.y;
  cx = clamp(cx, width / (2 * s) - 50, 1650 - width / (2 * s)); cy = clamp(cy, height / (2 * s) - 50, 1650 - height / (2 * s));
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#243c2c'; ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(s, s); ctx.translate(-cx, -cy);
  if (g.shake > 0) ctx.translate(Math.sin(g.clock * 130) * 3, Math.cos(g.clock * 100) * 3);
  const ground = g.mode === 'base' ? '#80956a' : REGIONS[g.region].ground;
  ctx.fillStyle = ground; ctx.fillRect(0, 0, BALANCE.world, BALANCE.world);
  if(g.expeditionMap){ctx.fillStyle='#20392ca0';ctx.fillRect(0,0,BALANCE.world,BALANCE.world);}
  // A hand-drawn terrain: translucent patches, a winding stream and footpaths.
  for (let i = 0; i < 35; i++) { ctx.fillStyle = i % 2 ? '#c1cc8612' : '#334c2810'; ellipse(ctx, (i * 311 + 80) % 1600, (i * 193 + 240) % 1600, 90 + i % 4 * 28, 35 + i % 3 * 25); }
  ctx.strokeStyle = '#455e5438'; ctx.lineWidth = 100; ctx.beginPath(); ctx.moveTo(100, 0); ctx.bezierCurveTo(270, 350, 5, 500, 175, 720); ctx.bezierCurveTo(340, 1000, 70, 1260, 150, 1600); ctx.stroke();
  ctx.strokeStyle = g.region === 7 && g.mode === 'expedition' ? '#bfd6d3' : '#779c97'; ctx.lineWidth = 73; ctx.stroke();
  ctx.strokeStyle = '#b6d0b338'; ctx.lineWidth = 2; for (let i = 0; i < 30; i++) { const y = i * 57; const x = 155 + Math.sin(y / 180) * 33; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 16, y); ctx.stroke(); }
  ctx.lineCap = 'round'; ctx.strokeStyle = '#c2b78a80'; ctx.lineWidth = 57; ctx.beginPath();
  if (g.mode === 'base') { ctx.moveTo(800, 1700); ctx.bezierCurveTo(980, 1200, 705, 1150, 800, 840); ctx.moveTo(800, 880); ctx.bezierCurveTo(1110, 880, 1140, 700, 1660, 690); }
  ctx.stroke(); ctx.strokeStyle = '#d3c69c25'; ctx.lineWidth = 42; ctx.stroke();
  if (g.expeditionMap) drawExpeditionRoads(ctx, g.expeditionMap);
  for (const d of g.decor.filter(d => d.type !== 'tree')) {
    if (d.type === 'grass') { ctx.strokeStyle = '#3f613b44'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(d.x - 4, d.y); ctx.lineTo(d.x - 6, d.y - 6); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 1, d.y - 9); ctx.moveTo(d.x + 4, d.y); ctx.lineTo(d.x + 7, d.y - 5); ctx.stroke(); }
    else if (d.type === 'flower') { ctx.fillStyle = d.variant > .5 ? '#e0cf9633' : '#d4e0b755'; for (let i = 0; i < 3; i++) circle(ctx, d.x + i * 5, d.y - (i % 2) * 5, 2); }
    else { shadow(ctx, d.x, d.y + 5, d.size * .7); poly(ctx, [[d.x - d.size * .6, d.y], [d.x - d.size * .3, d.y - d.size * .6], [d.x + d.size * .25, d.y - d.size * .7], [d.x + d.size * .6, d.y], [d.x + d.size * .3, d.y + 5]], '#a3ac96'); poly(ctx, [[d.x - d.size * .3, d.y - d.size * .6], [d.x + d.size * .25, d.y - d.size * .7], [d.x + d.size * .05, d.y - 2], [d.x - d.size * .6, d.y]], '#bcc3aa'); }
  }
  if (g.mode === 'base') {
    ctx.strokeStyle = '#c3d99c35'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 9]); circleStroke(ctx, 800, 800, 230); ctx.setLineDash([]);
    ctx.fillStyle = '#9fa77c55'; ellipse(ctx, 800, 840, 130, 83);
    if (g.base.upgrades.wall) { for (let i = 0; i < 30; i++) { const a = i * Math.PI * 2 / 32; const x = 800 + Math.cos(a) * 218, y = 800 + Math.sin(a) * 193; if (y > 960 && Math.abs(x - 800) < 70) continue; ctx.fillStyle = '#5d6450'; ctx.fillRect(x - 8, y - 25, 16, 33); ctx.fillStyle = '#a3ab8e'; ctx.fillRect(x - 9, y - 30, 18, 9); } }
    home(ctx, 800, 790, g.base.upgrades.base);
    // Camp props remain cosmetic until the corresponding facility is built.
    for (const [x, y] of [[720, 886], [731, 890], [715, 894]]) { ctx.fillStyle = '#746444'; ctx.fillRect(x, y, 15, 6); }
    ctx.fillStyle = '#554f39'; ellipse(ctx, 716, 921, 17, 11); ctx.strokeStyle = '#9c9575'; ctx.lineWidth = 4; circleStroke(ctx, 716, 918, 13);
    poly(ctx, [[707, 920], [713, 901 + Math.sin(g.clock * 5) * 3], [719, 913], [726, 904], [726, 922]], '#e8b469'); poly(ctx, [[713, 920], [718, 908], [722, 921]], '#f8df91');
    ctx.fillStyle = '#494f38'; ctx.fillRect(891, 838, 5, 48); poly(ctx, [[896, 837], [924, 844], [896, 856]], '#d6d4a0');
    if (g.base.upgrades.storage) building(ctx, 649, 816, '倉庫', '#8f896c');
    if (g.save.bases[0].upgrades.forge) building(ctx, 951, 806, '鍛冶屋', '#697578');
    if (g.base.upgrades.healer) { building(ctx, 849, 970, '救護所', '#b3baa1'); ctx.fillStyle = '#e9edda'; ctx.fillRect(841, 945, 17, 5); ctx.fillRect(847, 939, 5, 17); }
    for (let i = 0; i < g.base.upgrades.soldiers + g.base.upgrades.tower + g.base.upgrades.cannon; i++) { const p = g.allyPosition(i); if (i < g.base.upgrades.soldiers) person(ctx, p.x, p.y, '#9fc0bd', '#586f73', false, 1, g.clock + i); else if (i < g.base.upgrades.soldiers + g.base.upgrades.tower) tower(ctx, p.x, p.y); else cannon(ctx, p.x, p.y); }
    bar(ctx, 750, 718, 100, 5, g.base.hp / baseMaxHp(g.base), '#cce693'); label(ctx, 'HOME  /  LV.' + (g.base.upgrades.base + 1), 800, 704, '#f1f0d7', 10);
  }
  for (const p of g.points) {
    if (p.done) continue;
    shadow(ctx, p.x, p.y + 7, 24);
    if (p.type === 'portal') { ctx.strokeStyle = '#d3e9b5'; ctx.lineWidth = 2; ellipseStroke(ctx, p.x, p.y, 29, 14); ctx.fillStyle = '#5d6b50'; ctx.fillRect(p.x - 3, p.y - 55, 6, 52); poly(ctx, [[p.x - 25, p.y - 56], [p.x + 18, p.y - 56], [p.x + 28, p.y - 46], [p.x + 18, p.y - 36], [p.x - 25, p.y - 36]], '#d2d5a9'); label(ctx, '⌂', p.x, p.y - 42, '#41513b', 18); }
    if (p.type === 'resource') { if (REGIONS[g.region].resource === 'wood') tree(ctx, p.x, p.y, 39, false); else { for (let i = 0; i < 3; i++) poly(ctx, [[p.x - 21 + i * 13, p.y], [p.x - 14 + i * 13, p.y - 30 - i % 2 * 12], [p.x - 5 + i * 13, p.y - 9], [p.x - 11 + i * 13, p.y + 6]], REGIONS[g.region].resource === 'crystal' ? '#b2cbd7' : '#b7c1b1'); } }
    if (p.type === 'chest') { ctx.fillStyle = '#795b34'; round(ctx, p.x - 20, p.y - 23, 40, 29, 4); ctx.fillStyle = '#c5a36a'; round(ctx, p.x - 21, p.y - 27, 42, 12, 5); ctx.fillStyle = '#ecd391'; ctx.fillRect(p.x - 3, p.y - 20, 6, 12); }
    if (p.type === 'event') { ctx.fillStyle = '#e8dc98'; circle(ctx, p.x, p.y - 52 + Math.sin(g.clock * 2) * 4, 13); label(ctx, '!', p.x, p.y - 47 + Math.sin(g.clock * 2) * 4, '#5a603f', 17); person(ctx, p.x, p.y, '#d9c795', '#8c7860', false, -1, 0); }
    if (p.type === 'camp') { building(ctx, p.x, p.y, '', '#9d7569'); ctx.fillStyle = '#593c39'; ctx.fillRect(p.x + 26, p.y - 68, 4, 49); poly(ctx, [[p.x + 30, p.y - 68], [p.x + 55, p.y - 58], [p.x + 30, p.y - 48]], '#d08d75'); }
    if (distance(p, g.hero) < 130) label(ctx, p.label, p.x, p.y + 32, '#fff3ce', 12);
  }
  // Ground shadows and readable danger telegraphs precede all characters.
  for (const e of g.enemies) if (e.warning > 0) { const r = e.kind === 'boss' ? 115 : 75; ctx.fillStyle = '#ef695943'; circle(ctx, e.target.x, e.target.y, r); ctx.strokeStyle = '#f9baa0'; ctx.lineWidth = 2; circleStroke(ctx, e.target.x, e.target.y, r); ctx.fillStyle = '#f7846470'; circle(ctx, e.target.x, e.target.y, r * (1 - e.warning / 1.15)); }
  ctx.strokeStyle = '#e0efb918'; ctx.lineWidth = 1; ctx.setLineDash([3, 10]); circleStroke(ctx, g.hero.x, g.hero.y, g.stats.range); ctx.setLineDash([]);
  const actors = [...g.enemies.map(e => ({ y: e.y, draw: () => {
    const def = ENEMIES[e.kind]; const size = def.radius / 13;
    ctx.save(); ctx.translate(e.x, e.y); ctx.scale(size, size);
    person(ctx, 0, 0, e.hit > 0 ? '#fff0cd' : def.color, '#60544e', true, g.hero.x > e.x ? 1 : -1, g.clock * def.speed / 50);
    if (e.kind === 'boss' || e.kind === 'elite') { ctx.fillStyle = '#ead7a0'; poly(ctx, [[-9, -37], [-11, -45], [-4, -41], [0, -48], [4, -41], [11, -45], [9, -37]], '#e5d09b'); }
    if (e.kind === 'ranged') { ctx.strokeStyle = '#e4c795'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(16, -14, 13, -1.3, 1.3); ctx.stroke(); }
    if (e.kind === 'bomber') { ctx.fillStyle = '#ffd487'; circle(ctx, 0, -14, 6); }
    if (e.kind === 'tank' || e.kind === 'siege') { ctx.fillStyle = '#b1b4a4'; round(ctx, -16, -20, 11, 18, 3); }
    ctx.restore(); if (e.hp < e.maxHp || e.kind === 'boss' || e.kind === 'elite') bar(ctx, e.x - 22 * Math.min(size, 1.7), e.y - 44 * size, 44 * Math.min(size, 1.7), 4, e.hp / e.maxHp, e.kind === 'boss' ? '#edb292' : '#dfb89a');
    if (g.mode === 'expedition' && distance(g.hero, e) < 360) label(ctx, `Lv.${e.level}`, e.x, e.y - 48 * size, '#f4e5ce', 10);
  } })), { y: g.hero.y, draw: () => {
    ctx.strokeStyle = '#d9f4ac99'; ctx.lineWidth = 2; ellipseStroke(ctx, g.hero.x, g.hero.y + 5, 21, 11);
    ctx.globalAlpha = g.hero.invulnerable > 0 && Math.sin(g.clock * 30) > 0 ? .55 : 1;
    person(ctx, g.hero.x, g.hero.y, '#e3d7a8', '#526d57', false, g.hero.facing, (g.keys.size || Math.hypot(g.joystick.x, g.joystick.y) > .1) ? g.clock * 1.8 : 0, true); ctx.globalAlpha = 1;
    label(ctx, 'YOU', g.hero.x, g.hero.y - 47, '#f3f5dc', 9);
  } }, ...g.decor.filter(d => d.type === 'tree').map(d => ({ y: d.y, draw: () => { ctx.globalAlpha = distance(d, g.hero) < 80 ? .45 : 1; tree(ctx, d.x, d.y, d.size, g.mode === 'expedition' && g.region === 7); ctx.globalAlpha = 1; } }))];
  actors.sort((a, b) => a.y - b.y).forEach(a => a.draw());
  for (const b of g.bullets) { ctx.strokeStyle = b.color; ctx.lineWidth = b.enemy ? 4 : b.splash ? 6 : 3; ctx.beginPath(); ctx.moveTo(b.x - b.vx * .014, b.y - b.vy * .014 - 14); ctx.lineTo(b.x, b.y - 14); ctx.stroke(); }
  for (const e of g.effects) { if (!g.save.settings.particles && !e.text) continue; ctx.globalAlpha = Math.min(1, e.life / e.max * 1.5); if (e.text) { ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.strokeStyle = '#243428'; ctx.lineWidth = 3; ctx.strokeText(e.text, e.x, e.y - 28); ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, e.y - 28); } else { ctx.strokeStyle = e.color; ctx.lineWidth = 3 * e.life / e.max; circleStroke(ctx, e.x, e.y, e.radius * (1 - e.life / e.max)); } ctx.globalAlpha = 1; }
  ctx.restore();
  const vignette = ctx.createRadialGradient(width / 2, height / 2, width * .15, width / 2, height / 2, Math.max(width, height) * .7); vignette.addColorStop(0, '#142a1700'); vignette.addColorStop(1, '#152c244d'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
}

function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number) { c.beginPath(); c.arc(x, y, Math.max(.1, r), 0, Math.PI * 2); c.fill(); }
function circleStroke(c: CanvasRenderingContext2D, x: number, y: number, r: number) { c.beginPath(); c.arc(x, y, Math.max(.1, r), 0, Math.PI * 2); c.stroke(); }
function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
function ellipseStroke(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.stroke(); }
function poly(c: CanvasRenderingContext2D, points: number[][], color: string) { c.fillStyle = color; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); }
function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
function shadow(c: CanvasRenderingContext2D, x: number, y: number, r: number) { c.fillStyle = '#253d3230'; ellipse(c, x + 5, y + 3, r, r * .45); }
function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size: number) { c.font = `600 ${size}px system-ui`; c.textAlign = 'center'; c.fillStyle = '#30433455'; c.fillText(text, x, y + 1); c.fillStyle = color; c.fillText(text, x, y); }
function bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, color: string) { c.fillStyle = '#283c35aa'; round(c, x, y, w, h, 2); c.fillStyle = color; round(c, x, y, w * clamp(ratio, 0, 1), h, 2); }
function person(c: CanvasRenderingContext2D, x: number, y: number, shirt: string, pants: string, enemy: boolean, facing: number, time: number, hero = false) {
  shadow(c, x, y + 4, 13); c.save(); c.translate(x, y); c.scale(facing, 1);
  const stride = Math.sin(time * 7) * 3; c.fillStyle = pants; round(c, -8, -8, 6, 12 + stride, 3); round(c, 3, -8, 6, 12 - stride, 3);
  c.fillStyle = shirt; round(c, -11, -24, 22, 21, 6); if (hero) { c.fillStyle = '#6a8260'; round(c, -12, -23, 9, 20, 3); }
  c.fillStyle = enemy ? '#b6a68b' : '#efd7ad'; round(c, -8, -37, 16, 17, 7);
  c.fillStyle = enemy ? '#60564a' : hero ? '#4a604a' : '#627a74'; c.beginPath(); c.arc(0, -31, 9, Math.PI, 0); c.fill(); c.fillRect(-9, -33, 19, 3);
  c.fillStyle = '#384637'; c.fillRect(4, -29, 2, 2);
  if (hero || !enemy) { c.save(); c.translate(9, -14); c.rotate(-.25); c.fillStyle = '#586654'; round(c, 0, -4, 22, 6, 2); c.fillStyle = '#c3c6a2'; c.fillRect(17, -4, 7, 5); c.restore(); }
  else { c.strokeStyle = '#dfc297'; c.lineWidth = 4; c.beginPath(); c.moveTo(10, -11); c.lineTo(19, -25); c.stroke(); }
  c.restore();
}
function tree(c: CanvasRenderingContext2D, x: number, y: number, size: number, snow: boolean) { shadow(c, x + 8, y + 5, size * .85); c.fillStyle = '#6c7050'; c.fillRect(x - 4, y - 23, 8, 27); const colors = snow ? ['#879e90', '#abc3b1', '#d1dfcc'] : ['#466647', '#56784f', '#66865b']; for (let i = 0; i < 3; i++) poly(c, [[x - size * (1 - i * .18), y - 12 - i * size * .4], [x + size * (1 - i * .18), y - 12 - i * size * .4], [x, y - size * (2.15 + i * .2)]], colors[i]); }
function home(c: CanvasRenderingContext2D, x: number, y: number, level: number) { shadow(c, x, y + 44, 85); c.fillStyle = '#aaab83'; round(c, x - 53, y - 10, 106, 68, 3); c.fillStyle = '#bcc09a'; c.fillRect(x - 52, y - 4, 103, 46); c.fillStyle = '#575f45'; c.fillRect(x - 15, y + 12, 28, 45); c.fillStyle = '#d5c487'; c.fillRect(x - 39, y + 9, 15, 20); c.fillRect(x + 25, y + 9, 15, 20); c.fillStyle = '#696f50'; c.fillRect(x - 33, y + 9, 3, 20); c.fillRect(x + 31, y + 9, 3, 20); poly(c, [[x - 67, y - 1], [x, y - 67], [x + 67, y - 1]], '#455f4e'); poly(c, [[x - 60, y - 6], [x, y - 66], [x + 4, y - 6]], '#627b59'); c.strokeStyle = '#9eac7866'; c.lineWidth = 2; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x - 45 + i * 12, y - 8 - i * 12); c.lineTo(x + 46 - i * 12, y - 8 - i * 12); c.stroke(); } c.fillStyle = '#5c6952'; c.fillRect(x + 28, y - 62, 14, 31); c.fillStyle = '#849075'; c.fillRect(x + 25, y - 65, 20, 7); if (level > 2) { c.fillStyle = '#d6d6a0'; c.fillRect(x - 4, y - 89, 4, 23); poly(c, [[x, y - 89], [x + 29, y - 83], [x, y - 72]], '#dcd593'); } c.fillStyle = '#b8b18b'; c.fillRect(x - 23, y + 56, 43, 7); }
function building(c: CanvasRenderingContext2D, x: number, y: number, name: string, color: string) { shadow(c, x, y, 33); c.fillStyle = color; round(c, x - 26, y - 35, 52, 39, 3); poly(c, [[x - 34, y - 32], [x, y - 62], [x + 34, y - 32]], '#506354'); c.fillStyle = '#445340'; c.fillRect(x - 7, y - 16, 14, 20); if (name) label(c, name, x, y + 22, '#edf0d2', 10); }
function tower(c: CanvasRenderingContext2D, x: number, y: number) { shadow(c, x, y, 23); c.strokeStyle = '#706d50'; c.lineWidth = 7; for (const n of [-12, 12]) { c.beginPath(); c.moveTo(x + n, y); c.lineTo(x + n * .7, y - 45); c.stroke(); } c.fillStyle = '#a6a17a'; c.fillRect(x - 21, y - 47, 42, 10); person(c, x, y - 43, '#bac3a0', '#6b7a5f', false, 1, 0); }
function cannon(c: CanvasRenderingContext2D, x: number, y: number) { shadow(c, x, y, 26); c.fillStyle = '#58645a'; circle(c, x - 14, y - 5, 10); circle(c, x + 14, y - 5, 10); c.save(); c.translate(x, y - 8); c.rotate(-.6); c.fillStyle = '#8a9685'; round(c, -10, -11, 45, 20, 5); c.fillStyle = '#3e5047'; c.fillRect(28, -9, 8, 16); c.restore(); }

export function drawMinimap(ctx: CanvasRenderingContext2D, g: Game, size = 120) {
  ctx.clearRect(0, 0, size, size); ctx.fillStyle = '#253b30'; ctx.fillRect(0, 0, size, size); const k = size / 1600;
  ctx.strokeStyle = '#bdd7a510'; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * size / 4, 0); ctx.lineTo(i * size / 4, size); ctx.moveTo(0, i * size / 4); ctx.lineTo(size, i * size / 4); ctx.stroke(); }
  for (const d of g.decor.filter(d => d.type === 'tree')) { ctx.fillStyle = '#69876255'; circle(ctx, d.x * k, d.y * k, 2); }
  if (g.expeditionMap) {
    drawExpeditionRoads(ctx, g.expeditionMap, k);
    const p=g.expeditionMap.nodes.boss; ctx.fillStyle=g.bossDefeated ? '#a8c59c' : '#edaa91';
    ctx.fillRect(p.x*k-4,p.y*k-4,8,8);
    if(size>200) { ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText(g.bossDefeated ? '主 討伐済' : `主 ${Math.min(g.expeditionKills,g.bossTarget)}/${g.bossTarget}`,p.x*k,p.y*k-10); }
  }
  if (g.mode === 'base') { ctx.fillStyle = '#e4d5a0'; ctx.fillRect(800 * k - 4, 800 * k - 4, 8, 8); }
  for (const p of g.points.filter(p => !p.done)) {
    ctx.fillStyle = p.type === 'camp' ? '#d2a089' : p.type === 'portal' ? '#a7d6bd' : p.type === 'resource' ? '#a8c59c' : '#e8d396'; circle(ctx, p.x * k, p.y * k, size>200 ? 5 : 2.5);
    if(size>200) { ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText(({portal:'帰還',resource:'資源',chest:'宝箱',event:'発見',camp:'前哨地'})[p.type],p.x*k,p.y*k+17); }
  }
  for (const e of g.enemies) { ctx.fillStyle = e.kind === 'boss' ? '#ff846a' : '#d89583'; circle(ctx, e.x * k, e.y * k, e.kind === 'boss' ? 3.5 : 1.8); }
  ctx.fillStyle = '#d4f79f'; circle(ctx, g.hero.x * k, g.hero.y * k, 3.5); ctx.strokeStyle = '#d4f79f44'; ctx.lineWidth = 1; circleStroke(ctx, g.hero.x * k, g.hero.y * k, 7);
}

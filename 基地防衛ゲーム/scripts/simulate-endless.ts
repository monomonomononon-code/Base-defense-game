import { readFileSync, writeFileSync } from 'node:fs';
import { BALANCE } from '../src/game/data';
import { Game, distance, type Vec } from '../src/game/engine';
import { parseSave } from '../src/game/state';
import { buyMastery, type EndlessMode } from '../src/game/endless';
// Continue an earned campaign clear save. No injected money, combat buffs or gear.
const input = JSON.parse(readFileSync('docs/simulation/final-practiced.json','utf8'));
const results = [];
for (const mode of ['defense','expedition'] as EndlessMode[]) {
  let randomSeed = 1701; const original = Math.random;
  Math.random = () => { randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0; return randomSeed / 4294967296; };
  const s = parseSave(JSON.stringify(input.results[0].snapshot)); const start = s.elapsed;
  let deaths = 0; const ability: string = 'practiced'; const agentRandom = Math.random;
  const g = new Game(s, m => { if(m.includes('戦闘不能') || m.includes('拠点が陥落')) deaths++; }, () => {});
  g.persist = () => {}; g.ring = () => {}; g.float = () => {};
  g.startEndless(mode);
  function steering() {
    const hero = g.hero;
    const live = g.enemies.filter(e => e.hp > 0);
    const nearby = live.filter(e => distance(e, hero) < 320);
    let target: Vec = { x: 800, y: 825 };
    let preferKite = false;
    if (g.mode === 'base') {
      // Protect the house, prioritizing breaches instead of fleeing in circles.
      const threat = [...live].sort((a, b) => (distance(a, { x: 800, y: 800 }) + distance(a, hero) * .4) - (distance(b, { x: 800, y: 800 }) + distance(b, hero) * .4))[0];
      if (threat) target = threat;
      preferKite = threat?.kind === 'boss' || threat?.kind === 'elite';
    } else {
      const boss = live.find(e => e.kind === 'boss');
      const point = g.points.filter(p => !p.done && p.type !== 'portal').sort((a, b) => distance(a, hero) - distance(b, hero))[0];
      target = boss ?? point ?? nearby[0] ?? { x: 800, y: 800 };
      preferKite = !!boss;
      if (point && distance(point, hero) < 90 && !live.some(e => e.guard === point.id)) g.interact();
      if (point) { const guard = nearby.find(e => e.guard === point.id); if (guard) { target = guard; preferKite = true; } }
    }
    const dist = distance(target, hero) || 1;
    let vx = (target.x - hero.x) / dist, vy = (target.y - hero.y) / dist;
    if (preferKite && dist < g.stats.range * .8) {
      const radial = (dist - Math.min(190, g.stats.range * .7)) / 70;
      const x = vx, y = vy; vx = x * radial - y; vy = y * radial + x;
    } else if (g.mode === 'base' && !preferKite && live.length && dist < 155) { vx = 0; vy = 0; }
    const noticesTelegraph = ability === 'practiced' || agentRandom() > .2;
    for (const e of nearby) {
      const d = distance(e, hero) || 1;
      const safe = e.kind === 'ranged' ? 65 : 105;
      if (d < safe) { const f = (safe - d) / safe * 3; vx += (hero.x - e.x) / d * f; vy += (hero.y - e.y) / d * f; }
      if (noticesTelegraph && e.warning > 0 && distance(hero, e.target) < (e.kind === 'boss' ? 135 : 95)) {
        const away = distance(hero, e.target); const angle = away < 5 ? Math.atan2(vy, vx) : Math.atan2(hero.y - e.target.y, hero.x - e.target.x);
        vx += Math.cos(angle) * 3; vy += Math.sin(angle) * 3;
        if (e.warning < .4) g.dash();
      }
    }
    // A simple human-like sidestep, not omniscient immunity.
    for (const b of g.bullets) if (ability === 'practiced' && b.enemy && distance(b, hero) < 85) {
      const dot = (hero.x - b.x) * b.vx + (hero.y - b.y) * b.vy;
      if (dot > 0) { vx += -b.vy / 215 * .8; vy += b.vx / 215 * .8; }
    }
    if (hero.x < 120) vx += 2; if (hero.x > 1480) vx -= 2;
    if (hero.y < 120) vy += 2; if (hero.y > 1480) vy -= 2;
    const len = Math.max(1, Math.hypot(vx, vy)); g.joystick = { x: vx / len, y: vy / len };
    if (nearby.some(e => distance(e, hero) < BALANCE.skillRadius) && (ability === 'practiced' || agentRandom() > .2)) g.skill();
    if (hero.hp < g.stats.hp * .55) g.heal();
  }

  try {
    for(let frame=0; frame<36000 && (mode==='defense' ? s.endless.bestWave<10 : s.endless.bestDanger<5); frame++) {
      if(!g.endless) { while(buyMastery(s)) {} if(!g.startEndless(mode)) break; }
      if(mode==='defense' && !g.waveActive) { while(buyMastery(s)) {} }
      if(mode==='expedition' && g.bossDefeated) { g.leaveEndless(); while(buyMastery(s)) {} g.startEndless(mode); }
      if(frame % 3 === 0) steering();
      g.update(.05);
    }
    results.push({mode, minutes:+((s.elapsed-start)/60).toFixed(2), deaths, ...s.endless});
  } finally { Math.random = original; }
}
writeFileSync('docs/simulation/endless-smoke.json', JSON.stringify({methodology:'Actual combat from balanced seed17 campaign clear. 50ms updates;150ms steering. Bought mastery only with earned gold/shards. No resource or damage injection. Goals: defense Wave10 / expedition danger5;30 minute cutoff.',results},null,2));
console.log(JSON.stringify(results,null,2));
if(results.some(r=>r.mode==='defense'?r.bestWave<10:r.bestDanger<5)) process.exitCode=1;

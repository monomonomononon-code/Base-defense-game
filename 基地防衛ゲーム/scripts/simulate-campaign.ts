/** Deterministic, headless player. Uses the shipped engine and purchase APIs;
 * never grants XP, money, gear, discoveries, healing, or invulnerability. */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BALANCE, REGIONS, UPGRADES, enemyStats } from '../src/game/data';
import { Game, distance, type Vec } from '../src/game/engine';
import { baseMaxHp, buildSecondBase, buyEquipment, buySkill, buyUpgrade, equipmentCap, equipmentCost, newSave, skillCost, upgradeCost, upgradeLevel, upgradeLock, type EquipmentSlot } from '../src/game/state';

type Style = 'balanced' | 'offense' | 'fortress' | 'mobility' | 'defense-only' | 'expedition-only' | 'second-base';
const weights: Record<Style, number[]> = {
  balanced: [1.3, 1.2, .65, 1.1, .65, 1, .9, .85, 1, 1, .7, .9, 1, .85],
  offense: [2, 1.8, .65, .55, .65, .55, .5, .5, .6, .65, .35, .65, 1.6, .5],
  fortress: [.85, .8, .45, 1, .45, 1.8, 1.8, 1.5, 1.8, 1.8, 1.25, 1, .8, 1.5],
  mobility: [1.1, 1.1, 1.8, .85, 1.8, .75, .7, .65, .8, .8, .5, .8, 1, .65],
  'defense-only': [.9, .9, .5, .9, .5, 1.6, 1.6, 1.5, 1.6, 1.6, 1, 1, .8, 1.5],
  'expedition-only': [1.7, 1.5, 1, 1.2, 1, 0, 0, 0, 0, 0, 0, .65, 1.1, 0],
  'second-base': [.85, .8, .45, 1, .45, 1.8, 1.8, 1.5, 1.8, 1.8, 1.25, 1, .8, 1.5],
};
interface Purchase { minute: number; level: number; item: string; rank: number; gold: number }
interface Milestone { level: number; minute: number; gold: number; region: number; deaths: number; xp: number; weapon: number; armor: number; hp: number; attack: number; wave: number }

export function simulate(style: Style, seed: number, maxMinutes = 360, ability: 'practiced' | 'casual' = 'practiced', omit = '') {
  const originalRandom = Math.random;
  let randomSeed = seed;
  Math.random = () => { randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0; return randomSeed / 4294967296; };
  const s = newSave();
  let deaths = 0, losses = 0, expeditionCount = 0, lastDeparture = 0, lastDeathRegion = -1, failStreak = 0;
  let preparation = 0, baseSeconds = 0, expeditionSeconds = 0, minHp = 1, lastShop = -99, lastDecision = -99;
  let agentSeed = seed + 991; const agentRandom = () => { agentSeed = (agentSeed * 1664525 + 1013904223) >>> 0; return agentSeed / 4294967296; };
  let lastProgress = 0, lastLevel = 1, previousDiscoveries = 0, completeMinute: number | null = null;
  const purchases: Purchase[] = [], milestones: Milestone[] = [];
  const visits: { region: number; level: number; minute: number; seconds: number; result: string; prepared: boolean; bossBurstFraction: number; bossSpawnTime?: number; bossFightSeconds?: number }[] = [];
  let visit: typeof visits[number] | null = null;
  const g = new Game(s, message => { if (message.includes('戦闘不能') || message.includes('拠点が陥落')) { deaths++; if (message.includes('拠点が陥落')) losses++; lastDeathRegion = visit?.region ?? -1; failStreak++; if (visit) visit.result = 'death'; } }, () => {});
  // Rendering/persistence are irrelevant to combat, and do not run in Node.
  g.persist = () => {}; g.float = () => {}; g.ring = () => {};
  let heroDamage = 0, garrisonDamage = 0, healing = 0, damageTaken = 0;
  const hit = g.damage.bind(g), heal = g.heal.bind(g), hurt = g.hurt.bind(g);
  g.damage = (enemy, amount, isHero = false) => { const hp = Math.max(0, enemy.hp); hit(enemy, amount, isHero); const dealt = hp - Math.max(0, enemy.hp); if (g.mode === 'base') { if (isHero) heroDamage += dealt; else garrisonDamage += dealt; } };
  g.heal = () => { const hp = g.hero.hp; heal(); healing += Math.max(0, g.hero.hp - hp); };
  g.hurt = amount => { const hp = g.hero.hp; hurt(amount); damageTaken += Math.max(0, hp - Math.max(0, g.hero.hp)); };
  const minute = () => +(s.elapsed / 60 + preparation / 60).toFixed(2);
  const record = () => ({ level: s.level, minute: minute(), gold: s.gold, region: visit?.region ?? -1, deaths, xp: s.xp, weapon: s.equipment.weapon, armor: s.equipment.armor, hp: g.stats.hp, attack: Math.round(g.stats.attack), wave: g.base.wave });
  milestones.push(record());

  function shop() {
    if (s.elapsed - lastShop < 6) return;
    lastShop = s.elapsed;
    if (style === 'second-base' && s.bases.length === 1 && s.level >= 25 && s.gold >= 800 && buildSecondBase(s)) {
      purchases.push({ minute: minute(), level: s.level, item: 'second-base', rank: 1, gold: BALANCE.secondBase.gold });
      s.activeBase = 1; g.makeWorld();
    }
    for (let tries = 0; tries < 40; tries++) {
      const offers: { score: number; buy: () => boolean; item: string; rank: number; gold: number }[] = [];
      for (const [index, u] of UPGRADES.entries()) {
        if (u.id === omit) continue;
        const c = upgradeCost(s, u.id), lv = upgradeLevel(s, u.id);
        if (upgradeLock(s, u.id) || s.gold < c.gold || c.material && s.materials[c.material] < c.count) continue;
        const desired = ['soldiers', 'tower', 'cannon'].includes(u.id) ? 2 + s.level / 7 : ['move', 'range', 'healer', 'storage'].includes(u.id) ? 1 + s.level / 8 : 2 + s.level / 3;
        if (lv >= desired) continue;
        let weight = weights[style][index];
        if (['base', 'wall'].includes(u.id) && g.base.hp < baseMaxHp(g.base) * .6) weight *= 1.6;
        const score = weight / ((lv + 1) ** .45 * c.gold ** .65);
        if (score > 0) offers.push({ score, buy: () => buyUpgrade(s, u.id), item: u.id, rank: lv + 1, gold: c.gold });
      }
      for (const slot of ['weapon', 'armor', 'charm'] as EquipmentSlot[]) {
        if (slot === omit) continue;
        const n = s.equipment[slot], cost = equipmentCost(s, slot), resource = n >= 12 ? 'crystal' : n >= 4 ? 'iron' : 'wood';
        if (n >= equipmentCap(s) || s.gold < cost || s.materials[resource] < 4 + n * 2) continue;
        const w = slot === 'weapon' ? style === 'offense' ? 2.1 : 1.5 : slot === 'armor' ? style === 'offense' ? .55 : 1.2 : .9;
        offers.push({ score: w / ((n + 1) ** .45 * cost ** .65), buy: () => buyEquipment(s, slot), item: slot, rank: n + 1, gold: cost });
      }
      const skill = skillCost(s);
      if (omit !== 'skill' && s.skill < BALANCE.skillUpgrade.max && s.gold >= skill.gold && s.materials.crystal >= skill.crystal) offers.push({ score: 1 / ((s.skill + 1) ** .45 * skill.gold ** .65), buy: () => buySkill(s), item: 'skill', rank: s.skill + 1, gold: skill.gold });
      offers.sort((a, b) => b.score - a.score);
      const offer = offers[0]; if (!offer || !offer.buy()) break;
      purchases.push({ minute: minute(), level: s.level, item: offer.item, rank: offer.rank, gold: offer.gold });
    }
  }

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
    while (s.elapsed < maxMinutes * 60 && !(s.level === 55 && (s.completed || style === 'defense-only'))) {
      if (g.mode === 'base' && visit) { visit.seconds = +(s.elapsed - lastDeparture).toFixed(1); visits.push(visit); visit = null; }
      if (g.mode === 'base' && !g.waveActive) {
        shop();
        if (g.hero.hp < g.stats.hp * .96 || g.base.hp < baseMaxHp(g.base) * .96) { g.joystick = { x: (800 - g.hero.x) / 150, y: (840 - g.hero.y) / 150 }; }
        else {
          const required = !s.expeditionUnlocked || s.raidPending || style === 'defense-only';
          const voluntary = style !== 'expedition-only' && expeditionCount > 0 && expeditionCount % 3 === 0 && g.base.wave < 3 + Math.floor(expeditionCount / 3);
          if (required || voluntary) { g.startWave(); preparation += 5; }
          else {
            let region = [...REGIONS].reverse().find(r => r.min <= s.level - 2)?.id ?? 0;
            const unvisited = REGIONS.find(r => r.min <= s.level && !s.discoveries.includes(r.id));
            if (unvisited) region = unvisited.id;
            if (lastDeathRegion === region && failStreak >= 2) region = Math.max(0, region - 1);
            if (s.level >= 53) region = 10;
            // Backfill scarce resources with a short appropriate expedition.
            if (s.level > 20 && s.materials.wood < 12 && expeditionCount % 7 === 0) region = 2;
            if (g.travel(region)) { expeditionCount++; lastDeparture = s.elapsed; preparation += 12; visit = { region, level: s.level, minute: minute(), seconds: 0, result: 'return', prepared: g.prepared, bossBurstFraction: +(enemyStats('boss', REGIONS[region].max).attack * 2 * (1 - g.stats.damageReduction) * (g.prepared ? 1 - BALANCE.progression.supplyDamageReduction : 1) / g.stats.hp).toFixed(2) }; }
          }
        }
      }
      if (g.mode === 'expedition') {
        if (visit && g.bossSpawned && visit.bossSpawnTime === undefined) visit.bossSpawnTime = s.elapsed;
        if (visit && g.bossDefeated && visit.bossFightSeconds === undefined && visit.bossSpawnTime !== undefined) visit.bossFightSeconds = +(s.elapsed - visit.bossSpawnTime).toFixed(1);
        if (g.bossDefeated && g.points.filter(p => !p.done && p.type !== 'portal').length === 0 || s.elapsed - lastDeparture > 180 || s.raidPending) {
          if (visit && g.bossDefeated) visit.result = 'boss';
          if (g.bossDefeated) failStreak = 0;
          g.returnHome();
        }
      }
      if (g.waveActive || g.mode === 'expedition') {
        if (s.elapsed - lastDecision >= (ability === 'practiced' ? .15 : .65)) { steering(); lastDecision = s.elapsed; }
        if (ability === 'casual' && s.elapsed % 13 < .9) g.joystick = { x: 0, y: 0 };
      }
      if (g.mode === 'base') baseSeconds += .05; else expeditionSeconds += .05;
      g.update(.05);
      minHp = Math.min(minHp, g.hero.hp / g.stats.hp);
      if (s.completed && completeMinute === null) completeMinute = minute();
      if (s.level !== lastLevel || s.discoveries.length !== previousDiscoveries) {
        if (s.level !== lastLevel) { for (let lv = lastLevel + 1; lv <= s.level; lv++) milestones.push({ ...record(), level: lv }); }
        lastProgress = s.elapsed; lastLevel = s.level; previousDiscoveries = s.discoveries.length;
      }
      if (s.elapsed - lastProgress > 1200) break;
    }
    if (visit) { visit.seconds = +(s.elapsed - lastDeparture).toFixed(1); visits.push(visit); }
    const gaps = purchases.map((p, i) => +(p.minute - (purchases[i - 1]?.minute ?? 0)).toFixed(2));
    return { style, seed, ability, omit, level: s.level, completed: s.completed, minutes: minute(), completeMinute, level55Minute: milestones.find(m => m.level === 55)?.minute ?? null, deaths, losses, waves: s.bases.reduce((sum, base) => sum + base.wave, 0), expeditions: expeditionCount, baseMinutes: +(baseSeconds / 60).toFixed(2), expeditionMinutes: +(expeditionSeconds / 60).toFixed(2), gold: s.gold, materials: s.materials, equipment: s.equipment, upgrades: g.base.upgrades, discoveries: s.discoveries, bosses: s.bosses, purchases, maxPurchaseGap: Math.max(...gaps, 0), milestones, visits, minHp, garrisonDamageShare: +(garrisonDamage / Math.max(1, heroDamage + garrisonDamage)).toFixed(3), healing: Math.round(healing), damageTaken: Math.round(damageTaken), snapshot: s };
  } finally { Math.random = originalRandom; }
}

const name = process.argv[2] ?? 'current';
const styles = (process.argv[3]?.split(',') ?? ['balanced', 'offense', 'fortress', 'mobility', 'defense-only', 'expedition-only']) as Style[];
const seeds = (process.argv[4]?.split(',') ?? ['17', '41', '89']).map(Number);
const results = [];
for (const style of styles) for (const seed of seeds) { const result = simulate(style, seed, 360, process.argv[5] === 'casual' ? 'casual' : 'practiced', process.argv[6] ?? ''); results.push(result); console.log(JSON.stringify({ style, seed, omit: result.omit, level: result.level, completed: result.completed, minutes: result.minutes, deaths: result.deaths, losses: result.losses, waves: result.waves, expeditions: result.expeditions, gold: result.gold, weapon: result.equipment.weapon, armor: result.equipment.armor, purchases: result.purchases.length, maxPurchaseGap: result.maxPurchaseGap })); }
mkdirSync('docs/simulation', { recursive: true });
const sources = ['src/game/data.ts', 'src/game/state.ts', 'src/game/engine.ts', 'scripts/simulate-campaign.ts'];
writeFileSync(`docs/simulation/${name}.json`, JSON.stringify({ sourceHashes: Object.fromEntries(sources.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])), balance: BALANCE, methodology: 'Actual engine, 50ms steps. Practiced:150ms decisions. Casual:650ms decisions,20% telegraph misses,no bullet sidestep,0.9s hesitation/13s. No resource injection; real purchases/drops/unlocks/raids. +5s wave / +12s expedition menu time. Seeded random; 6h or 20min no level/discovery cutoff. Omit means do not PURCHASE that upgrade; equipment drops and unupgraded skill remain available.', results }, null, 2));

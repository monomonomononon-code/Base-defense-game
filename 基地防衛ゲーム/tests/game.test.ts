import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE, ENEMIES, LEVELS, REGIONS, UPGRADES, enemyStats } from '../src/game/data';
import { baseMaxHp, buildSecondBase, buyEquipment, buyUpgrade, gainXp, heroStats, newSave, parseSave, upgradeCost } from '../src/game/state';
import { Game } from '../src/game/engine';

const makeGame = () => new Game(newSave(), () => {}, () => {});
const advance = (g: Game, seconds: number) => { for (let n = 0; n < seconds * 20; n++) g.update(.05); };

test('the entire Lv1–55 table is monotonic, finite, and reachable with real enemy XP', () => {
  const s = newSave(); let kills = 0;
  for (let lv = 1; lv <= 55; lv++) {
    assert.equal(s.level, lv);
    const row = LEVELS[lv - 1]; assert.equal(row.level, lv); assert.ok(row.hp > 0 && row.attack > 0);
    if (lv > 1) { assert.ok(row.hp > LEVELS[lv - 2].hp); assert.ok(row.attack > LEVELS[lv - 2].attack); }
    if (lv === 55) break;
    while (s.level === lv) { gainXp(s, enemyStats('melee', lv).xp); kills++; assert.ok(kills < 10000); }
  }
  gainXp(s, 1e6); assert.equal(s.level, 55); assert.equal(s.xp, 0);
});

test('all 11 regions have regular foes, guard events, chests, bosses, and rewards', () => {
  const g = makeGame(); g.save.expeditionUnlocked = true;
  for (const r of REGIONS) {
    assert.ok(g.travel(r.id)); assert.ok(g.points.some(p => p.type === 'event')); assert.ok(g.points.some(p => p.type === 'resource')); assert.ok(g.points.some(p => p.type === 'camp')); assert.ok(g.points.some(p => p.type === 'chest')); assert.equal(g.enemies.filter(e => e.kind === 'elite').length, 3);
    for (const kind of [...r.enemies, 'elite', 'boss'] as const) { const stats = enemyStats(kind, r.max); assert.ok(Number.isFinite(stats.hp) && stats.hp > 0 && stats.xp > 0 && stats.gold > 0); }
    g.returnHome();
  }
  assert.equal(Object.keys(ENEMIES).length, 10);
});

test('Lv8 can enter Lv12–20 mines and even Lv48–55 final region', () => {
  const g = makeGame(); g.save.level = 8;
  assert.equal(g.travel(3), false); g.save.expeditionUnlocked = true;
  assert.equal(g.travel(3), true); assert.equal(g.region, 3);
  assert.ok(enemyStats('elite', 20).attack * 2 > g.stats.hp, 'elite telegraph in Lv20 region is lethal to a fresh Lv8');
  g.returnHome(); assert.equal(g.travel(10), true);
});

test('scouting a high-level region does not permanently raise base difficulty', () => {
  const g = makeGame(); g.save.expeditionUnlocked = true; const initial = g.danger;
  g.travel(10); g.returnHome(); assert.equal(g.danger, initial);
  g.save.bosses.push(10); assert.ok(g.danger > initial);
});

test('three actual defense waves spawn, grant coins, and unlock expeditions', () => {
  const g = makeGame(); let bosses = 0;
  for (let wave = 0; wave < 3; wave++) {
    g.startWave();
    for (let n = 0; n < 1200 && g.waveActive; n++) {
      g.update(.05);
      for (const e of g.enemies) { if (e.kind === 'boss') bosses++; g.damage(e, e.maxHp, true); }
    }
    assert.equal(g.base.wave, wave + 1); assert.equal(g.waveActive, false);
  }
  assert.equal(bosses, 1); assert.equal(g.save.expeditionUnlocked, true); assert.ok(g.save.gold > 300); assert.ok(g.save.level > 1);
  assert.ok(buyUpgrade(g.save, 'attack')); assert.ok(g.stats.attack > LEVELS[g.save.level - 1].attack);
});

test('first wave is beatable by automatic attacks with a novice holding position', () => {
  const g = makeGame(); const original = Math.random; let seed = 41;
  Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  try { g.startWave(); for (let i = 0; i < 2400 && g.waveActive; i++) { if (g.hero.hp < g.stats.hp * .5) g.heal(); g.update(.05); } assert.equal(g.base.wave, 1); assert.ok(g.hero.hp > 0); } finally { Math.random = original; }
});

test('guarded discoveries require victory, unlock facilities, and persist on returning home', () => {
  const g = makeGame(); g.save.expeditionUnlocked = true; g.travel(3);
  const p = g.points.find(p => p.type === 'event')!; g.hero.x = p.x; g.hero.y = p.y;
  g.interact(); assert.equal(g.save.discoveries.includes(3), false);
  const guard = g.enemies.find(e => e.guard === p.id)!; g.damage(guard, guard.hp, true); g.interact(); assert.ok(g.save.discoveries.includes(3));
  const resource = g.points.find(p => p.type === 'resource')!; g.hero.x = resource.x; g.hero.y = resource.y; g.interact();
  g.returnHome(); assert.ok(g.save.materials.iron > 0); g.save.gold = 1000; assert.ok(buyUpgrade(g.save, 'forge'));
  assert.ok(parseSave(JSON.stringify(g.save)).discoveries.includes(3));
});

test('a camp extends raid interval only once per region', () => {
  const g = makeGame(); g.save.expeditionUnlocked = true; const first = g.raidInterval();
  for (let visit = 0; visit < 2; visit++) { g.travel(0); const p = g.points.find(p => p.type === 'camp')!; const guard = g.enemies.find(e => e.guard === p.id)!; g.damage(guard, guard.hp, true); g.hero.x = p.x; g.hero.y = p.y; g.interact(); g.returnHome(); }
  assert.equal(g.raidInterval(), first + BALANCE.campRaidDelay); assert.deepEqual(g.save.camps, [0]);
});

test('fourteen kills summon regional boss; final boss completes campaign', () => {
  const g = makeGame(); g.save.expeditionUnlocked = true; g.travel(10); g.expeditionKills = 14;
  g.update(.05); const boss = g.enemies.find(e => e.kind === 'boss')!; assert.ok(boss); assert.equal(boss.level, 55);
  g.damage(boss, boss.hp, true); assert.ok(g.save.completed); assert.ok(g.save.bosses.includes(10)); assert.ok(g.save.materials.crystal >= 12 && g.save.materials.crystal <= 14);
  advance(g, .1); assert.equal(g.enemies.filter(e => e.kind === 'boss').length, 0);
});

test('hero is more effective than garrison against bosses', () => {
  const g = makeGame(); g.spawn('boss'); const e = g.enemies[0]; const before = e.hp;
  g.damage(e, 100, false); assert.equal(before - e.hp, 42);
  const afterAlly = e.hp; g.damage(e, 100, true); assert.ok(afterAlly - e.hp >= 100);
});

test('dash grants invulnerability, skill has a cooldown, pause freezes timers', () => {
  const g = makeGame(); g.dash(); const hp = g.hero.hp; g.hurt(100); assert.equal(g.hero.hp, hp);
  g.spawn('tank', { x: 800, y: 950 }); g.skill(); const first = g.enemies[0].hp; g.skill(); assert.equal(g.enemies[0].hp, first);
  g.paused = true; const elapsed = g.save.elapsed; const cooldown = g.hero.skill; advance(g, 10); assert.equal(g.save.elapsed, elapsed); assert.equal(g.hero.skill, cooldown);
});

test('raid countdown forces return and starts defense without deleting collected resources', () => {
  const g = makeGame(); g.save.expeditionUnlocked = true; g.travel(0); g.save.materials.wood = 67;
  g.save.nextRaid = 0; g.update(.05); assert.ok(g.save.raidPending);
  g.save.raidTime = .02; g.update(.05); assert.equal(g.mode, 'base'); assert.ok(g.waveActive); assert.equal(g.save.materials.wood, 67);
});

test('every third timed raid requires the hero even with a strong garrison', () => {
  const g = makeGame(); g.save.expeditionUnlocked = true; g.base.upgrades.soldiers = 10; g.base.upgrades.tower = 8;
  for (let i = 1; i <= 3; i++) { g.base.hp = baseMaxHp(g.base); g.save.nextRaid = 0; g.update(.05); assert.equal(g.save.raids, i); assert.equal(g.save.raidPending, i === 3); }
});

test('in-flight hero bullets retain their identity when leveling or upgrading', () => {
  const g = makeGame(); g.spawn('elite', { x: 900, y: 940 }); const e = g.enemies[0];
  g.update(.05); assert.ok(g.bullets.some(b => b.hero)); const originalDamage = g.bullets[0].damage;
  g.save.level = 2; advance(g, .15);
  assert.ok(e.maxHp - e.hp >= originalDamage, 'bullet must not get the garrison resistance after a stat change');
});

test('Lv55 final boss can be defeated with real projectiles, cooldowns, and kiting', () => {
  const s = newSave(); s.level = 55; s.expeditionUnlocked = true; s.nextRaid = 1e9;
  s.equipment = { weapon: 16, armor: 16, charm: 12 }; Object.assign(s.bases[0].upgrades, { attack: 12, speed: 8, health: 16, forge: 8, move: 4 }); s.skill = 6;
  const g = new Game(s, () => {}, () => {}); g.travel(10); g.enemies = []; g.spawnClock = 1e9; g.bossSpawned = true;
  const clearing = g.expeditionMap!.nodes.boss;
  g.hero.x = clearing.x; g.hero.y = clearing.y + 180; g.spawn('boss', { ...clearing });
  const original = Math.random; Math.random = () => .9;
  try {
    for (let n = 0; n < 2400 && !s.completed && g.mode === 'expedition'; n++) {
      const boss = g.enemies.find(e => e.kind === 'boss'); if (!boss) break;
      const dx = g.hero.x - boss.x, dy = g.hero.y - boss.y, length = Math.hypot(dx, dy); const radial = (180 - length) / 90;
      g.joystick = { x: -dy / length + dx / length * radial, y: dx / length + dy / length * radial };
      // Steer back into the clearing when circling reaches the forest edge.
      const edge=Math.hypot(g.hero.x-clearing.x,g.hero.y-clearing.y);
      if(edge>260) {g.joystick.x+=(clearing.x-g.hero.x)/edge*2;g.joystick.y+=(clearing.y-g.hero.y)/edge*2;}
      if(boss.warning>0 && boss.warning<.5) g.dash();
      if (length < BALANCE.skillRadius) g.skill(); if (g.hero.hp < g.stats.hp * .6) g.heal();
      g.update(.05);
    }
    assert.ok(s.completed, `fully simulated level-appropriate boss fight should be winnable: ${JSON.stringify({mode:g.mode,time:g.clock,hp:g.hero.hp,boss:g.enemies.find(e=>e.kind==='boss')?.hp})}`); assert.ok(g.hero.hp > 0);
  } finally { Math.random = original; }
});

test('second base retains permanent hero upgrades but has independent facilities and discounted cost', () => {
  const s = newSave(); s.discoveries.push(5); s.gold = 10000; s.materials.iron = 100; s.materials.wood = 100;
  buyUpgrade(s, 'attack'); const attack = heroStats(s).attack; const price = upgradeCost(s, 'wall').gold;
  assert.ok(buildSecondBase(s)); s.activeBase = 1; assert.equal(heroStats(s).attack, attack); assert.equal(s.bases[1].upgrades.base, 0);
  assert.ok(upgradeCost(s, 'wall').gold < price); assert.ok(buyUpgrade(s, 'wall')); assert.equal(s.bases[0].upgrades.wall, 0); assert.equal(s.bases[1].upgrades.wall, 1);
  assert.equal(s.bases[1].hp, baseMaxHp(s.bases[1]));
});

test('purchases never create negative balances and equipment respects progression locks', () => {
  const s = newSave(); const gold = s.gold;
  assert.equal(buyUpgrade(s, 'attack'), false); assert.equal(s.gold, gold);
  s.gold = 1e8; s.materials = { wood: 10000, iron: 10000, crystal: 10000 };
  assert.equal(buyUpgrade(s, 'tower'), false);
  for (let i = 0; i < 4; i++) assert.ok(buyEquipment(s, 'weapon'));
  assert.equal(buyEquipment(s, 'weapon'), false); s.discoveries.push(3); assert.ok(buyEquipment(s, 'weapon'));
  for (const u of UPGRADES) { for (let i = 0; i < 30; i++) buyUpgrade(s, u.id); }
  assert.ok(s.gold >= 0); assert.ok(Object.values(s.materials).every(v => v >= 0));
});

test('death keeps equipment and materials but removes exactly 8% of gold', () => {
  const g = makeGame(); g.save.gold = 1000; g.save.materials.iron = 20; g.save.equipment.weapon = 5;
  g.die(); assert.equal(g.save.gold, 920); assert.equal(g.save.materials.iron, 20); assert.equal(g.save.equipment.weapon, 5); assert.equal(g.hero.hp, g.stats.hp); assert.equal(g.mode, 'base');
});

test('save round-trip preserves progression and corrupted data safely falls back', () => {
  const s = newSave(); s.level = 45; s.discoveries = [0, 3, 5]; s.equipment.weapon = 12; s.materials.crystal = 57; s.settings.shake = false;
  assert.deepEqual(parseSave(JSON.stringify(s)), s);
  assert.equal(parseSave('{bad').level, 1); assert.equal(parseSave('null').level, 1);
  const invalid = parseSave(JSON.stringify({ ...s, level: 900, activeBase: 5, materials: { iron: -3 }, discoveries: [-1, 3, 3, 100, null] }));
  assert.equal(invalid.level, 55); assert.equal(invalid.activeBase, 0); assert.equal(invalid.materials.iron, 0); assert.deepEqual(invalid.discoveries, [3]);
});

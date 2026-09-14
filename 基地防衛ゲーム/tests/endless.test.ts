import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/engine';
import { newSave, parseSave, heroStats } from '../src/game/state';
import { ENDLESS, endlessUnlocked, endlessProfile, endlessEnemyStats, buyMastery, masteryCost } from '../src/game/endless';
import { enemyStats } from '../src/game/data';

function game() {
  const s = newSave(); s.level = 55; s.completed = true; s.expeditionUnlocked = true;
  const g = new Game(s, () => {}, () => {}); g.persist = () => {}; return g;
}
function clearWave(g: Game) {
  // Accelerate spawn scheduling, but exercise spawn, kill, rewards and wave completion.
  while (g.spawnLeft > 0) { g.spawnTimer = 0; g.hero.invulnerable = 100; g.update(.05); for (const e of g.enemies) g.damage(e, e.maxHp * 2, true); }
  g.update(.05);
}

test('Lv55 plus actual final boss defeat unlocks endless without changing equipment', () => {
  const g = game(); g.save.completed = false; g.save.equipment.weapon = 18;
  assert.equal(g.startEndless('defense'), false);
  g.travel(10); g.spawn('boss'); g.damage(g.enemies.at(-1)!, 1e12, true);
  assert.ok(endlessUnlocked(g.save)); g.returnHome(); assert.ok(g.startEndless('defense'));
  assert.equal(g.save.equipment.weapon, 18); assert.equal(g.save.level, 55);
  const s = newSave(); s.completed = true; s.level = 54; assert.equal(endlessUnlocked(s), false);
});

test('five endless waves include a boss, advance difficulty and preserve campaign wave', () => {
  const g = game(); g.save.bases[0].wave = 30; assert.ok(g.startEndless('defense'));
  for (let i = 1; i < 5; i++) { clearWave(g); assert.equal(g.save.endless.bestWave, i); g.startWave(); }
  g.spawnLeft = 1; g.spawnTimer = 0; g.update(.05);
  assert.ok(g.enemies.some(e => e.kind === 'boss'));
  for (const e of g.enemies) g.damage(e, e.maxHp * 2, true); g.update(.05);
  assert.equal(g.endlessRound, 6); assert.equal(g.danger, 57); assert.equal(g.waveTotal, 27);
  assert.equal(g.base.wave, 30); assert.equal(g.save.endless.bestWave, 5);
  assert.ok(g.save.endless.rewards.gold > 0); assert.ok(g.save.endless.shards > 0);
  for (let i = 0; i < 121; i++) g.update(.05);
  assert.ok(g.waveActive, 'next wave begins after intermission');
});

test('unbounded danger scales finite enemy HP, damage, count, rewards and rare chance', () => {
  const first = endlessProfile(1), later = endlessProfile(10), extreme = endlessProfile(10000);
  assert.ok(later.level > 55 && extreme.level > 10000);
  for (const key of ['health', 'attack', 'count', 'reward', 'rare'] as const) assert.ok(later[key] > first[key]);
  const boss = endlessEnemyStats('boss', 10000); assert.ok(Number.isFinite(boss.hp) && Number.isFinite(boss.attack));
  const g = game(); g.startEndless('defense'); g.endlessRound = 46; g.spawn('melee');
  assert.equal(g.enemies.at(-1)!.level, later.level);
  assert.equal(g.enemies.at(-1)!.hp, endlessEnemyStats('melee', 10).hp);
  const enemy = g.enemies.at(-1)!; enemy.x = g.hero.x; enemy.y = g.hero.y; enemy.cd = 0;
  g.save.endless.mastery = 100; g.hero.invulnerable = 0; g.hero.hp = g.stats.hp; const hp = g.hero.hp; g.update(.05);
  assert.ok(Math.abs(hp - g.hero.hp - endlessEnemyStats('melee', 10).attack) < .01);
});

test('expedition clears unlock next danger, regenerate world and leave campaign discoveries intact', () => {
  const g = game(); g.save.discoveries = [1, 3]; const old = [...g.save.discoveries];
  assert.ok(g.startEndless('expedition')); assert.equal(g.nextEndless(), false);
  assert.equal(g.enemies.filter(e => e.kind === 'elite').length, 3);
  const positions = g.points.map(p => [p.x, p.y]);
  g.enemies = []; const event = g.points.find(p => p.type === 'event')!; g.hero.x = event.x; g.hero.y = event.y; g.interact();
  assert.deepEqual(g.save.discoveries, old); assert.ok(g.save.endless.shards > 0);
  g.expeditionKills = g.bossTarget; g.update(.05); const boss = g.enemies.find(e => e.kind === 'boss')!;
  assert.ok(boss); g.damage(boss, boss.hp * 2, true);
  assert.equal(g.save.endless.bestDanger, 1); assert.ok(g.bossDefeated);
  assert.ok(g.nextEndless()); assert.equal(g.endlessRound, 2); assert.equal(g.danger, 57);
  assert.notDeepEqual(g.points.map(p => [p.x, p.y]), positions);
  g.returnHome(); assert.equal(g.endless, null); assert.equal(g.mode, 'base');
  assert.ok(g.startEndless('expedition')); assert.equal(g.endlessRound, 2);
});

test('reward multipliers include kills, nodes, chests and rare shards with cumulative ledger', () => {
  for (const stage of [1, 9]) {
    const g = game(); g.startEndless('expedition'); g.endlessRound = stage;
    const before = g.save.gold; g.enemies = []; g.spawn('melee');
    g.damage(g.enemies[0], 1e20, true);
    assert.equal(g.save.gold - before, Math.round(enemyStats('melee', 55).gold * endlessProfile(stage).reward));
    const chest = g.points.find(p => p.type === 'chest')!; g.hero.x = chest.x; g.hero.y = chest.y;
    g.interact(); assert.ok(chest.done); assert.ok(g.save.endless.rewards.rareDrops >= 1);
    assert.equal(g.save.endless.rewards.gold, g.save.gold - before);
    assert.equal(g.save.endless.rewards.shards, g.save.endless.shards);
    for (const key of ['wood','iron','crystal'] as const) assert.equal(g.save.endless.rewards[key], g.save.materials[key]);
    const count = g.save.endless.rewards.rareDrops; g.interact(); assert.equal(g.save.endless.rewards.rareDrops, count);
  }
});

test('rare drop rolls use the increasing endless probability', () => {
  const original = Math.random;
  try {
    Math.random = () => .16;
    const g = game(); g.startEndless('defense'); g.equipmentDrop(); assert.equal(g.save.endless.rewards.rareDrops, 0);
    g.endlessRound = 46; g.equipmentDrop(); assert.equal(g.save.endless.rewards.rareDrops, 1);
  } finally { Math.random = original; }
});

test('mastery consumes rewards, grows without campaign caps, and affects only endless combat', () => {
  const g = game(), before = heroStats(g.save); g.save.endless.mastery = 100;
  const c = masteryCost(g.save); g.save.gold = c.gold; g.save.endless.shards = c.shards;
  assert.ok(buyMastery(g.save)); assert.equal(g.save.endless.mastery, 101); assert.equal(g.save.gold, 0); assert.equal(g.save.endless.shards, 0);
  assert.equal(buyMastery(g.save), false); assert.deepEqual(g.stats, before);
  g.startEndless('defense'); assert.ok(g.stats.attack > before.attack * 10); assert.ok(g.stats.hp > before.hp * 10);
  g.leaveEndless(); assert.deepEqual(g.stats, before); assert.ok(g.hero.hp <= g.stats.hp);
});

test('save/load migrates old saves and retains records, large rewards and mastery', () => {
  const g = game(); g.save.endless.bestWave = 1234567; g.save.endless.bestDanger = 8000;
  g.save.endless.mastery = 125; g.save.endless.shards = 1e15; g.save.endless.rewards.gold = 1e16; g.save.gold = 1e15;
  const restored = parseSave(JSON.stringify(g.save)); assert.deepEqual(restored.endless, g.save.endless); assert.equal(restored.gold, 1e15);
  const old = { ...g.save } as Record<string, unknown>; delete old.endless;
  assert.equal(parseSave(JSON.stringify(old)).endless.bestWave, 0);
  const corrupt = parseSave(JSON.stringify({ ...g.save, endless: { bestWave: -4, mastery: 'bad', rewards: { gold: null } } }));
  assert.equal(corrupt.endless.bestWave, 0); assert.equal(corrupt.endless.mastery, 0); assert.equal(corrupt.endless.rewards.gold, 0);
  const loaded = new Game(restored, () => {}, () => {}); loaded.persist = () => {};
  assert.equal(loaded.endless, null); assert.ok(loaded.startEndless('defense')); assert.equal(loaded.endlessRound, 1234568);
});

test('endless pauses campaign raids, blocks campaign travel, and preserves records on defeat', () => {
  const g = game(); g.save.nextRaid = g.save.elapsed + 1; g.startEndless('expedition');
  const timer = g.save.nextRaid - g.save.elapsed;
  for (let i = 0; i < 50; i++) g.update(.05);
  assert.ok(Math.abs(g.save.nextRaid - g.save.elapsed - timer) < .001); assert.equal(g.save.raidPending, false);
  assert.equal(g.travel(0), false); g.save.endless.bestDanger = 3; g.save.endless.shards = 9; g.die();
  assert.equal(g.endless, null); assert.equal(g.save.endless.bestDanger, 3); assert.equal(g.save.endless.shards, 9);
  g.save.raidPending = true; assert.equal(g.startEndless('defense'), false);
});

test('retiring and restarting cannot award completion or skip uncleared danger', () => {
  const g = game(); g.startEndless('defense'); g.leaveEndless(); assert.equal(g.save.endless.bestWave, 0);
  assert.equal(g.save.endless.rewards.gold, 0); g.startEndless('defense'); assert.equal(g.endlessRound, 1);
  g.leaveEndless(); g.save.endless.bestWave = 10; g.startEndless('defense', true); assert.equal(g.endlessRound, 1);
  clearWave(g); assert.equal(g.save.endless.bestWave, 10);
  assert.ok(ENDLESS.bossEvery === 5);
});

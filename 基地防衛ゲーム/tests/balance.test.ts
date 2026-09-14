import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../src/game/data';
import { clampSfxVolume, SFX_COOLDOWNS } from '../src/game/audio';
import { Game } from '../src/game/engine';
import { newSave, parseSave, heroStats, buyUpgrade, equipmentCost, equipmentCap, upgradeCost, baseMaxHp } from '../src/game/state';
const game = () => new Game(newSave(), () => {}, () => {});

test('armor milestones mitigate actual damage and combine with expedition supplies', () => {
  const g = game(); g.save.equipment.armor = 18; g.hero.hp = 1000; g.hero.invulnerable = 0;
  g.hurt(100); assert.equal(g.hero.hp, 918);
  g.save.expeditionUnlocked = true; g.save.supplies = 1; g.travel(0);
  g.hero.hp = 1000; g.hero.invulnerable = 0; g.hurt(100);
  assert.ok(Math.abs(g.hero.hp - (1000 - 82 * .88)) < .001);
});

test('defense earns finite supplies, used once per expedition, with no entry gate', () => {
  const g = game(); g.startWave(); g.spawnLeft = 0; g.update(.05);
  assert.equal(g.save.supplies, 2); g.save.expeditionUnlocked = true;
  const ordinary = g.stats.attack; g.travel(0); assert.equal(g.save.supplies, 1); assert.ok(g.prepared); assert.ok(g.stats.attack > ordinary * 1.2);
  g.returnHome(); assert.equal(g.stats.attack, ordinary); g.travel(0); g.returnHome();
  assert.equal(g.save.supplies, 0); assert.ok(g.travel(10)); assert.equal(g.prepared, false);
});

test('supply XP boosts suitable encounters; low-level farming loses efficiency', () => {
  const ready = game(), empty = game(); ready.save.expeditionUnlocked = empty.save.expeditionUnlocked = true;
  ready.save.level = empty.save.level = 30; ready.save.supplies = 1;
  ready.travel(6); empty.travel(6); ready.experience(100, 30); empty.experience(100, 30);
  assert.equal(ready.save.xp, 120); assert.equal(empty.save.xp, 100);
  empty.save.xp = 0; empty.experience(100, 1); assert.equal(empty.save.xp, 8);
});

test('weapon milestones produce distinct power jumps; mountain bridges crafting cap', () => {
  const s = newSave(); s.level = 20; s.equipment.weapon = 5; const before = heroStats(s).attack;
  s.equipment.weapon = 6; assert.ok(heroStats(s).attack / before > 1.2);
  s.discoveries = [3]; assert.equal(equipmentCap(s), 12);
  s.discoveries.push(6); assert.equal(equipmentCap(s), 14);
  s.discoveries.push(8); assert.equal(equipmentCap(s), 18);
});

test('forge improves crafting prices and upper upgrades actually consume rare crystals', () => {
  const s = newSave(); s.equipment.weapon = 10; const original = equipmentCost(s, 'weapon');
  s.bases[0].upgrades.forge = 10; assert.ok(equipmentCost(s, 'weapon') < original * .7);
  s.bases[0].upgrades.attack = 10; s.discoveries = [9]; s.gold = 100000;
  assert.equal(upgradeCost(s, 'attack').material, 'crystal'); s.materials.crystal = 5;
  assert.equal(buyUpgrade(s, 'attack'), false); s.materials.crystal = 6;
  assert.ok(buyUpgrade(s, 'attack')); assert.equal(s.materials.crystal, 0);
});

test('healer improves field potion recovery and prepared field regeneration', () => {
  const g = game(); g.save.expeditionUnlocked = true; g.save.supplies = 1; g.base.upgrades.healer = 5;
  g.travel(0); g.hero.invulnerable = 0; g.hero.hp = 10; g.heal();
  assert.ok(g.hero.potion < BALANCE.healCooldown); assert.ok(g.hero.hp > 10 + g.stats.hp * BALANCE.potionHeal);
  g.hero.hp = 30; g.update(.05); assert.ok(g.hero.hp > 30);
});

test('wall makes unattended small raids less damaging and training counts toward garrison', () => {
  const bare = game(), wall = game();
  for (const g of [bare, wall]) { g.save.expeditionUnlocked = true; g.save.nextRaid = 0; g.save.level = 30; g.base.upgrades.soldiers = 5; }
  bare.base.upgrades.training = 15; wall.base.upgrades.training = 15; wall.base.upgrades.wall = 10;
  bare.base.hp = baseMaxHp(bare.base); wall.base.hp = baseMaxHp(wall.base); bare.update(.05); wall.update(.05);
  assert.equal(bare.save.raidPending, false); assert.equal(wall.save.raidPending, false);
  assert.ok(wall.base.hp / baseMaxHp(wall.base) > bare.base.hp / baseMaxHp(bare.base));
});

test('old saves migrate supplies safely and retain hero progression', () => {
  const old: Record<string, unknown> = { ...newSave(), level: 40 }; delete old.supplies;
  const restored = parseSave(JSON.stringify(old)); assert.equal(restored.level, 40); assert.equal(restored.supplies, 0);
  assert.equal(parseSave(JSON.stringify({ ...old, supplies: 999 })).supplies, 12);
});

test('sound settings migrate, clamp safely, and high-frequency effects are throttled', () => {
  const old: Record<string, unknown> = { ...newSave(), settings: { particles: true, shake: true } };
  const migrated = parseSave(JSON.stringify(old));
  assert.equal(migrated.settings.sfxVolume, .55); assert.equal(migrated.settings.sfxMuted, false);
  const restored = parseSave(JSON.stringify({ ...old, settings: { particles: false, shake: false, sfxVolume: 4, sfxMuted: true } }));
  assert.equal(restored.settings.sfxVolume, 1); assert.equal(restored.settings.sfxMuted, true);
  assert.equal(clampSfxVolume(-2), 0); assert.ok(SFX_COOLDOWNS.attack > 0 && SFX_COOLDOWNS.hit > 0 && SFX_COOLDOWNS.bossAppear >= 1);
});

import { enemyStats, type EnemyKind } from './data';
import type { Save } from './state';

// Campaign balance stays in data.ts. These effects apply only inside endless runs.
export const ENDLESS = {
  unlockLevel: 55, bossEvery: 5, intermission: 6,
  firstLevel: 55, levelsPerStage: 2,
  healthPerStage: .12, attackPerStage: .07,
  rewardBase: 1.5, rewardPerStage: .16,
  countBase: 24, countPerStage: 3, liveEnemyLimit: 48,
  spawnInterval: 1.5, spawnAcceleration: .03, minSpawnInterval: .35,
  bossKills: 18, killsPerStage: 2, maxBossKills: 60,
  rareBase: .12, rarePerStage: .008, rareMax: .65,
  shardDropBase: 2, shardDropPerStage: .4, clearShards: 12,
  masteryGrowth: .08, masteryGold: 1400, masteryShards: 16, masteryGoldGrowth: .15, masteryShardGrowth: .08,
  rewards: { chestGold: 600, campGold: 400, nodeMaterial: 18, eventMaterial: 30, rareCrystal: 3, bossGold: 1200, bossMaterial: 40, waveGold: 700, waveIron: 20, waveCrystal: 10 },
  // Numerical safety for JS serialization, not a gameplay level gate.
  safeValue: 1e100,
};
export type EndlessMode = 'defense' | 'expedition';
export interface EndlessSave {
  bestWave: number; bestDanger: number; mastery: number; shards: number;
  rewards: { gold: number; wood: number; iron: number; crystal: number; shards: number; rareDrops: number };
}
export const newEndless = (): EndlessSave => ({ bestWave: 0, bestDanger: 0, mastery: 0, shards: 0, rewards: { gold: 0, wood: 0, iron: 0, crystal: 0, shards: 0, rareDrops: 0 } });
export const endlessUnlocked = (s: Save) => s.level >= ENDLESS.unlockLevel && s.completed;
export const endlessStageForWave = (wave: number) => 1 + Math.floor((wave - 1) / ENDLESS.bossEvery);
export function endlessProfile(stage: number) {
  const n = Math.max(0, stage - 1);
  return {
    level: ENDLESS.firstLevel + n * ENDLESS.levelsPerStage,
    health: (1 + n * ENDLESS.healthPerStage) ** 2,
    attack: (1 + n * ENDLESS.attackPerStage) ** 2,
    reward: ENDLESS.rewardBase * (1 + n * ENDLESS.rewardPerStage) ** 2,
    count: ENDLESS.countBase + n * ENDLESS.countPerStage,
    interval: Math.max(ENDLESS.minSpawnInterval, ENDLESS.spawnInterval / (1 + n * ENDLESS.spawnAcceleration)),
    bossKills: Math.min(ENDLESS.maxBossKills, ENDLESS.bossKills + n * ENDLESS.killsPerStage),
    rare: Math.min(ENDLESS.rareMax, ENDLESS.rareBase + n * ENDLESS.rarePerStage),
  };
}
export function endlessEnemyStats(kind: EnemyKind, stage: number) {
  const p = endlessProfile(stage), base = enemyStats(kind, ENDLESS.firstLevel);
  // Use a polynomial continuation, avoiding campaign exponential overflow at huge levels.
  return { ...base, hp: Math.min(ENDLESS.safeValue, base.hp * p.health), attack: Math.min(ENDLESS.safeValue, base.attack * p.attack) };
}
export const masteryMultiplier = (s: Save) => Math.min(ENDLESS.safeValue, (1 + s.endless.mastery * ENDLESS.masteryGrowth) ** 2);
export const masteryCost = (s: Save) => ({ gold: Math.ceil(ENDLESS.masteryGold * (1 + s.endless.mastery * ENDLESS.masteryGoldGrowth) ** 2), shards: Math.ceil(ENDLESS.masteryShards * (1 + s.endless.mastery * ENDLESS.masteryShardGrowth)) });
export function buyMastery(s: Save) {
  const cost = masteryCost(s);
  if (!endlessUnlocked(s) || s.gold < cost.gold || s.endless.shards < cost.shards) return false;
  s.gold -= cost.gold; s.endless.shards -= cost.shards; s.endless.mastery++;
  return true;
}

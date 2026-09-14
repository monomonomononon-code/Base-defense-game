import test from 'node:test';
import assert from 'node:assert/strict';
import { SFX_COOLDOWNS, clampSfxVolume, sfx, type SfxId } from '../src/game/audio';
import { Game } from '../src/game/engine';
import { newSave } from '../src/game/state';

const required: SfxId[] = ['attack', 'hit', 'kill', 'hurt', 'coin', 'chest', 'levelUp', 'upgrade', 'build', 'confirm', 'error', 'wave', 'bossAppear', 'bossDefeat', 'unlock', 'gameOver'];

test('the complete required sound catalog has positive replay limits', () => {
  assert.deepEqual(Object.keys(SFX_COOLDOWNS).sort(), [...required].sort());
  for (const id of required) assert.ok(SFX_COOLDOWNS[id] > 0);
  assert.equal(clampSfxVolume(-1), 0); assert.equal(clampSfxVolume(2), 1); assert.equal(clampSfxVolume('bad'), .55);
});

test('combat events request throttled sound cues without requiring audio in Node', () => {
  const played: SfxId[] = [], original = sfx.play;
  sfx.play = ((id: SfxId) => { played.push(id); return true; }) as typeof sfx.play;
  try {
    const save = newSave(), game = new Game(save, () => {}, () => {}); game.persist = () => {};
    game.startWave(); game.spawn('boss');
    const boss = game.enemies.at(-1)!; game.damage(boss, 1, true); game.damage(boss, boss.hp + 1, true);
    game.hero.invulnerable = 0; game.hurt(1); game.die();
    assert.ok(played.includes('wave')); assert.ok(played.includes('bossAppear')); assert.ok(played.includes('hit'));
    assert.ok(played.includes('bossDefeat')); assert.ok(played.includes('coin')); assert.ok(played.includes('hurt')); assert.ok(played.includes('gameOver'));
  } finally { sfx.play = original; }
});

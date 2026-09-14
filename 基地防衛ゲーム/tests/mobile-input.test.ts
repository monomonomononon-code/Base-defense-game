import test from 'node:test';
import assert from 'node:assert/strict';
import { compactNotice, MOBILE_NOTICE_LIMIT, MobilePointers } from '../src/game/mobileInput';
import { Game } from '../src/game/engine';
import { newSave } from '../src/game/state';

test('mobile notices are compact and limited to two visible entries', () => {
  assert.equal(MOBILE_NOTICE_LIMIT, 2);
  assert.equal(compactNotice('LEVEL UP！ Lv.27 — HP全回復・基礎能力上昇'), 'LEVEL UP！ Lv.27');
  assert.equal(compactNotice('武器 +14 を入手・自動装備！'), '武器 +14 を入手！');
  assert.equal(compactNotice('発見：古代の鍛冶場 — 高級武器を解禁'), '発見：古代の鍛冶場');
  assert.equal(compactNotice('地平を喰らう王を討伐！ 世界に新しい朝が訪れました。旅はこの先も続けられます'), '最終ボス撃破！');
  assert.ok(compactNotice('とても長い通知'.repeat(8)).length <= 26);
});

test('movement and several skill fingers keep independent pointer sessions', () => {
  const pointers = new MobilePointers();
  assert.ok(pointers.beginMovement(11));
  assert.ok(pointers.isMovement(11));
  assert.ok(pointers.beginSkill(22));
  assert.ok(pointers.beginSkill(33));
  assert.ok(pointers.beginSkill(44));
  pointers.endSkill(22);
  assert.ok(pointers.isMovement(11), 'releasing dash must not stop movement');
  assert.equal(pointers.endMovement(33), false, 'a skill finger must not release the stick');
  assert.ok(pointers.isMovement(11));
  assert.ok(pointers.endMovement(11));
  assert.equal(pointers.isMovement(11), false);
});

test('dash, whirlwind and heal execute while the movement pointer remains held', () => {
  const game = new Game(newSave(), () => {}, () => {});
  const pointers = new MobilePointers();
  assert.ok(pointers.beginMovement(1));
  game.joystick = { x: 1, y: 0 };
  const startX = game.hero.x;

  assert.ok(pointers.beginSkill(2));
  game.dash();
  pointers.endSkill(2);
  assert.ok(game.hero.dash > 0 && pointers.isMovement(1));
  game.update(.05);
  assert.ok(game.hero.x > startX, 'movement must continue through dash');

  game.spawn('melee', { x: game.hero.x + 20, y: game.hero.y });
  const enemy = game.enemies.at(-1)!;
  const enemyHp = enemy.hp;
  assert.ok(pointers.beginSkill(3));
  game.skill();
  pointers.endSkill(3);
  assert.ok(enemy.hp < enemyHp && pointers.isMovement(1));

  game.hero.hp = game.stats.hp / 2;
  const hurtHp = game.hero.hp;
  assert.ok(pointers.beginSkill(4));
  game.heal();
  pointers.endSkill(4);
  assert.ok(game.hero.hp > hurtHp && pointers.isMovement(1));
});

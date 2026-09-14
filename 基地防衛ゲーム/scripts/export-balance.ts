import { writeFileSync } from 'node:fs';
import { LEVELS, enemyStats } from '../src/game/data';
const rows = ['level,xpToNext,heroHP,heroAttack,normalHP,normalAttack,normalXP,bossHP,bossAttack,bossXP'];
for (const row of LEVELS) { const normal = enemyStats('melee', row.level), boss = enemyStats('boss', row.level); rows.push([row.level, row.xp, row.hp, row.attack, normal.hp, +normal.attack.toFixed(2), normal.xp, boss.hp, +boss.attack.toFixed(2), boss.xp].join(',')); }
writeFileSync(new URL('../docs/levels.csv', import.meta.url), rows.join('\n') + '\n');
console.log('Exported all 55 levels to docs/levels.csv');

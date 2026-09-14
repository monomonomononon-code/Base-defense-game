import { ENDLESS, endlessUnlocked, endlessProfile, endlessStageForWave, endlessEnemyStats, masteryMultiplier, type EndlessMode } from './endless';
import { BALANCE, ENEMIES, REGIONS, enemyStats, materialYield, type EnemyKind, type Resource } from './data';
import { baseMaxHp, currentBase, gainXp, heroStats, newSave, SAVE_KEY, type Save } from './state';
import { sfx } from './audio';
import { createExpeditionMap, distanceToRoad, patrolPosition, EXPLORATION, moveOnMap, clearPath, routeWaypoints, type ExpeditionMap } from './expeditionMap';
export interface Vec { x: number; y: number }
export interface Enemy extends Vec { id: number; kind: EnemyKind; level: number; hp: number; maxHp: number; cd: number; phase: number; warning: number; target: Vec; hit: number; guard?: string; patrol?: boolean; route?: Vec[]; navClock?: number; sight?: boolean }
export interface Bullet extends Vec { vx: number; vy: number; damage: number; life: number; enemy: boolean; hero: boolean; splash: number; color: string }
export interface Effect extends Vec { text?: string; color: string; life: number; max: number; radius: number }
export interface Point extends Vec { id: string; type: 'resource' | 'chest' | 'event' | 'camp' | 'portal'; done: boolean; label: string }
export interface Decor extends Vec { type: 'tree' | 'rock' | 'grass' | 'flower'; size: number; variant: number }
export type ViewMode = 'base' | 'expedition';
export class Game {
  expeditionMap: ExpeditionMap | null = null; private mapVisits = 0;
  endless: EndlessMode | null = null; endlessRound = 1; intermission = 0; worldSeed = 0;
  save: Save; mode: ViewMode = 'base'; region = 0; prepared = false;
  hero = { x: 800, y: 940, hp: 120, cd: 0, dash: 0, skill: 0, potion: 0, invulnerable: 0, dashTime: 0, facing: 1 };
  enemies: Enemy[] = []; bullets: Bullet[] = []; effects: Effect[] = []; points: Point[] = []; decor: Decor[] = [];
  keys = new Set<string>(); joystick: Vec = { x: 0, y: 0 }; lastDirection: Vec = { x: 0, y: -1 };
  paused = false; overlay = false; waveActive = false; spawnLeft = 0; spawnTimer = 0; spawnClock = 1;
  expeditionKills = 0; bossSpawned = false; bossDefeated = false; allyClock = 0; clock = 0; autoSave = 0; shake = 0;
  notify: (message: string) => void; onChange: () => void; savedAt = ''; saveError = false; id = 0; revisionClock = 0;
  constructor(save: Save, notify: (message: string) => void, onChange: () => void) { this.save = save; this.notify = notify; this.onChange = onChange; sfx.configure(save.settings.sfxVolume, save.settings.sfxMuted); this.hero.hp = heroStats(save).hp; this.makeWorld(); }
  get stats() { const stats = heroStats(this.save, this.mode === 'expedition' && this.prepared); if (!this.endless) return stats; const power = masteryMultiplier(this.save); return { ...stats, hp: stats.hp * power, attack: stats.attack * power }; }
  get base() { return currentBase(this.save); }
  get danger() { if (this.endless) return this.endlessProfile.level; return Math.min(BALANCE.maxLevel, Math.max(1, Math.round(this.save.level * .65 + this.base.upgrades.base * .6 + Math.max(...this.save.bosses, ...this.save.discoveries, 0) * 1.35))); }
  get waveTotal() { if (this.endless) return this.endlessProfile.count; return 8 + Math.min(22, this.base.wave * 2); }
  get endlessStage() { return this.endless === 'defense' ? endlessStageForWave(this.endlessRound) : this.endlessRound; }
  get endlessProfile() { return endlessProfile(this.endlessStage); }
  get bossTarget() { return this.endless ? this.endlessProfile.bossKills : BALANCE.expeditionKillsForBoss; }
  enemyPower(kind: EnemyKind, level: number) { return this.endless ? endlessEnemyStats(kind, this.endlessStage) : enemyStats(kind, level); }
  awardGold(amount: number) { const value = this.endless ? Math.round(amount * this.endlessProfile.reward) : amount; this.save.gold = Math.min(ENDLESS.safeValue, this.save.gold + value); if (this.endless) this.save.endless.rewards.gold = Math.min(ENDLESS.safeValue, this.save.endless.rewards.gold + value); return value; }
  awardMaterial(resource: Resource, amount: number) { const value = this.endless ? Math.max(1, Math.round(amount * this.endlessProfile.reward)) : amount; this.save.materials[resource] = Math.min(ENDLESS.safeValue, this.save.materials[resource] + value); if (this.endless) this.save.endless.rewards[resource] = Math.min(ENDLESS.safeValue, this.save.endless.rewards[resource] + value); return value; }
  awardShards(amount: number) { const n = Math.ceil(amount); this.save.endless.shards = Math.min(ENDLESS.safeValue, this.save.endless.shards + n); this.save.endless.rewards.shards = Math.min(ENDLESS.safeValue, this.save.endless.rewards.shards + n); }
  startEndless(mode: EndlessMode, restart = false) {
    if (!endlessUnlocked(this.save) || this.waveActive || this.save.raidPending || this.mode !== 'base' || this.endless) return false;
    this.endless = mode; this.endlessRound = restart ? 1 : (mode === 'defense' ? this.save.endless.bestWave : this.save.endless.bestDanger) + 1;
    this.hero.hp = this.stats.hp; this.paused = false;
    if (mode === 'defense') { this.base.hp = baseMaxHp(this.base); this.startWave(); }
    else this.enterEndlessExpedition();
    return true;
  }
  enterEndlessExpedition() {
    this.worldSeed = Math.floor(Math.random() * 0xffffffff);
    const region = (this.endlessRound + Math.floor(Math.random() * REGIONS.length)) % REGIONS.length;
    this.travel(region, true);
    this.hero.hp = this.stats.hp;
  }
  nextEndless() {
    if (this.endless !== 'expedition' || !this.bossDefeated) return false;
    this.endlessRound++; this.enterEndlessExpedition(); return true;
  }
  leaveEndless() {
    if (!this.endless) return;
    this.endless = null; this.mode = 'base'; this.waveActive = false; this.spawnLeft = 0; this.intermission = 0;
    this.enemies = []; this.bullets = []; this.effects = []; this.hero.x = 800; this.hero.y = 975;
    this.hero.hp = Math.min(this.hero.hp, this.stats.hp); this.makeWorld(); this.persist(); this.emit('エンドレスから帰還。獲得報酬と最高記録を保存しました');
  }
  get nearestPoint() {
    return this.points.reduce<Point | undefined>((nearest, point) => {
      if (point.done || distance(point, this.hero) >= 95) return nearest;
      return !nearest || distance(point, this.hero) < distance(nearest, this.hero) ? point : nearest;
    }, undefined);
  }
  emit(message: string) { this.notify(message); this.onChange(); }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); this.savedAt = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }); this.saveError = false; } catch { this.saveError = true; } this.onChange(); }
  reset() { this.endless = null; this.intermission = 0; this.save = newSave(); this.mode = 'base'; this.region = 0; this.waveActive = false; this.enemies = []; this.bullets = []; this.effects = []; this.hero.x = 800; this.hero.y = 940; this.hero.hp = this.stats.hp; this.hero.cd = this.hero.dash = this.hero.skill = this.hero.potion = this.hero.invulnerable = this.hero.dashTime = 0; this.makeWorld(); this.persist(); this.emit('新しい旅が始まりました'); }
  makeWorld() {
    let seed = this.mode === 'base' ? 781 : this.worldSeed + this.region * 951;
    this.expeditionMap = this.mode === 'expedition' ? createExpeditionMap(seed, this.region) : null;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    this.decor = Array.from({ length: 220 }, () => ({ x: random() * 1600, y: random() * 1600, type: (['tree', 'rock', 'grass', 'grass', 'flower'] as const)[Math.floor(random() * 5)], size: 12 + random() * 22, variant: random() }));
    this.decor = this.decor.filter(d => this.mode !== 'base' || distance(d, { x: 800, y: 800 }) > 230);
    this.points = this.mode === 'base' ? [] : [
      { id: 'portal', type: 'portal', x: 800, y: 1340, label: '帰還の道標', done: false },
      { id: 'resource1', type: 'resource', x: 450, y: 980, label: '資源を採取', done: false },
      { id: 'resource2', type: 'resource', x: 1200, y: 600, label: '資源を採取', done: false },
      { id: 'chest', type: 'chest', x: 360, y: 450, label: '宝箱を開く', done: false },
      { id: 'event', type: 'event', x: 1080, y: 340, label: REGIONS[this.region].event, done: false },
      { id: 'camp', type: 'camp', x: 1280, y: 920, label: '敵の前哨地を破壊', done: false },
    ];
    if (this.expeditionMap) {
      for (const p of this.points) { Object.assign(p, this.expeditionMap.nodes[p.id as keyof ExpeditionMap['nodes']]); if (this.endless && p.type === 'event') p.label = '古代の補給庫を調査'; }
      this.decor = this.decor.filter(d => distanceToRoad(d, this.expeditionMap!) > 115 && Object.values(this.expeditionMap!.nodes).every(p=>distance(p,d)>140));
    }
  }
  travel(region: number, endlessTravel = false) {
    if ((this.endless && !endlessTravel) || !this.save.expeditionUnlocked || this.waveActive || this.save.raidPending || !REGIONS[region]) return false;
    this.prepared = this.save.supplies > 0; if (this.prepared) this.save.supplies--;
    this.mode = 'expedition'; this.region = region; this.hero.x = 800; this.hero.y = 1260; this.hero.invulnerable = 2;
    if (!endlessTravel) this.worldSeed = 1451 + ++this.mapVisits + Math.floor(this.save.elapsed * 10);
    this.enemies = []; this.bullets = []; this.effects = []; this.expeditionKills = 0; this.bossSpawned = false; this.bossDefeated = false; this.spawnClock = 1;
    if (!this.endless && !this.save.visited.includes(region)) this.save.visited.push(region);
    this.makeWorld();
    for (const p of this.points.filter(p => ['event', 'chest', 'camp'].includes(p.type))) this.spawn('elite', { x: p.x + 50, y: p.y + 25 }, p.id);
    this.persist(); this.emit(`${REGIONS[region].name}へ到着。${this.prepared ? '遠征補給を使用しました' : '補給なしで出発しました'}。赤は短い危険路、緑は資源の回り道、金は宝箱への道です`); return true;
  }
  returnHome(forced = false) {
    if (this.endless) { this.leaveEndless(); return; }
    if (this.mode === 'base') return;
    this.mode = 'base'; this.enemies = []; this.bullets = []; this.effects = []; this.hero.x = 800; this.hero.y = 975; this.hero.invulnerable = 2; this.makeWorld();
    this.hero.hp = Math.min(this.stats.hp, this.hero.hp + this.stats.hp * (.25 + this.base.upgrades.base * .03));
    this.persist(); this.emit(forced ? '襲撃の知らせ！ 拠点に緊急帰還しました' : 'おかえりなさい。遠征の成果を持ち帰りました');
    if (this.save.raidPending) this.startWave();
  }
  startWave() {
    if (this.waveActive || this.mode !== 'base') return;
    this.waveActive = true; this.spawnLeft = this.waveTotal; this.spawnTimer = .7;
    this.base.hp = Math.min(baseMaxHp(this.base), this.base.hp + baseMaxHp(this.base) * .25);
    sfx.play('wave');
    this.emit(`WAVE ${this.endless ? this.endlessRound : this.base.wave + 1} — 拠点を守れ`);
  }
  spawn(kind?: EnemyKind, at?: Vec, guard?: string) {
    const r = REGIONS[this.region]; const level = this.mode === 'base' ? (!this.save.expeditionUnlocked ? 1 + Math.floor(this.base.wave / 2) : this.danger) : r.min + Math.floor(Math.random() * (r.max - r.min + 1));
    const table: EnemyKind[] = this.mode === 'base' ? (this.save.expeditionUnlocked ? ['melee', 'runner', 'tank', 'ranged', 'siege', 'hunter', 'bomber', 'swarm'] : ['melee', 'melee', 'swarm', 'runner']) : r.enemies;
    kind ??= table[Math.floor(Math.random() * table.length)];
    const angle = Math.random() * Math.PI * 2; const center = this.mode === 'base' ? { x: 800, y: 800 } : this.hero;
    const patrol = !at && kind !== 'boss' && this.mode === 'expedition' && !!this.expeditionMap;
    if (patrol) { at = patrolPosition(this.expeditionMap!, this.hero, this.enemies, angle / (Math.PI * 2)); if (!at) return; }
    at ??= { x: clamp(center.x + Math.cos(angle) * 560, 70, 1530), y: clamp(center.y + Math.sin(angle) * 560, 70, 1530) };
    const lv = this.endless ? this.endlessProfile.level : kind === 'boss' && this.mode === 'expedition' ? r.max : level; const stats = this.enemyPower(kind, lv);
    this.enemies.push({ ...at, kind, level: lv, id: this.id++, hp: stats.hp, maxHp: stats.hp, cd: 1.2, phase: 3, warning: 0, target: { ...at }, hit: 0, guard, patrol: patrol || (kind === 'boss' && this.mode === 'expedition') });
    if (kind === 'boss') sfx.play('bossAppear');
  }
  dash() { if (this.paused || this.overlay || this.hero.dash > 0) return; this.hero.dash = BALANCE.dashCooldown; this.hero.dashTime = BALANCE.dashDuration; this.hero.invulnerable = BALANCE.dashInvulnerability; this.ring(this.hero, '#e5f4b6', 50); }
  skill() {
    if (this.paused || this.overlay || this.hero.skill > 0) return;
    this.hero.skill = BALANCE.skillCooldown / (1 + this.save.skill * BALANCE.skillUpgrade.cooldown); this.ring(this.hero, '#d4f798', BALANCE.skillRadius, .6);
    for (const e of this.enemies) if (distance(e, this.hero) < BALANCE.skillRadius + ENEMIES[e.kind].radius && (!this.expeditionMap || clearPath(this.hero,e,this.expeditionMap,2))) { this.damage(e, this.stats.attack * (BALANCE.skillDamage + this.save.skill * BALANCE.skillUpgrade.damage), true); const a = Math.atan2(e.y - this.hero.y, e.x - this.hero.x); const moved=this.expeditionMap ? moveOnMap(e,Math.cos(a)*50,Math.sin(a)*50,this.expeditionMap) : {x:clamp(e.x+Math.cos(a)*50,25,1575),y:clamp(e.y+Math.sin(a)*50,25,1575)};e.x=moved.x;e.y=moved.y; }
    if (this.save.settings.shake) this.shake = .14;
  }
  heal() { if (this.paused || this.overlay || this.hero.potion > 0 || this.hero.hp >= this.stats.hp) return; this.hero.potion = BALANCE.healCooldown * (1 - Math.min(BALANCE.progression.maxPotionReduction, this.base.upgrades.healer * BALANCE.progression.healerPotionReduction)); this.hero.hp = Math.min(this.stats.hp, this.hero.hp + this.stats.hp * (BALANCE.potionHeal + this.base.upgrades.healer * BALANCE.progression.healerPotionAmount + (this.save.discoveries.includes(9) ? .15 : 0))); this.ring(this.hero, '#8fe0b0', 65); this.float(this.hero, '回復', '#c1f4c3'); }
  interact() {
    if (this.paused || this.overlay) return;
    const p = this.nearestPoint; if (!p) return;
    if (p.type === 'portal') { this.returnHome(); return; }
    if (this.enemies.some(e => e.hp > 0 && e.guard === p.id)) { this.emit('この場所はエリートが守っています。先に倒しましょう'); return; }
    if (this.endless) {
      const resource = REGIONS[this.region].resource;
      if (p.type === 'chest') { this.awardGold(ENDLESS.rewards.chestGold); this.equipmentDrop(true); sfx.play('chest'); }
      else if (p.type === 'camp') this.awardGold(ENDLESS.rewards.campGold);
      this.awardMaterial(resource, p.type === 'resource' ? ENDLESS.rewards.nodeMaterial : ENDLESS.rewards.eventMaterial);
      if (p.type === 'event') this.awardShards(ENDLESS.clearShards * this.endlessProfile.reward);
      p.done = true; this.ring(p, '#e5d694', 65); this.persist(); this.emit('エンドレス報酬を獲得しました'); return;
    }
    const r = REGIONS[this.region]; const amount = materialYield(r.resource, BALANCE.loot.resourceBase + r.min * BALANCE.loot.resourceGrowth);
    if (p.type === 'resource') { this.save.materials[r.resource] += amount; this.emit(`資源を採取：${r.resource === 'wood' ? '木材' : r.resource === 'iron' ? '鉄鉱石' : '結晶'} +${amount}`); }
    if (p.type === 'chest') { const gold = BALANCE.loot.chestGold + r.min * BALANCE.loot.chestGoldGrowth; this.save.gold += gold; this.save.materials[r.resource] += amount; this.equipmentDrop(true); sfx.play('chest'); this.emit(`宝箱を発見！ ${gold} コインと素材・装備を獲得`); }
    if (p.type === 'event') { if (!this.save.discoveries.includes(r.id)) { this.save.discoveries.push(r.id); sfx.play('unlock'); this.emit(`発見：${r.event} — ${r.unlock}`); } else { this.save.materials[r.resource] += amount; this.emit('協力者から補給素材を受け取りました'); } this.experience(BALANCE.loot.eventXp + r.min * BALANCE.loot.eventXpGrowth); }
    if (p.type === 'camp') { if (!this.save.camps.includes(r.id)) { this.save.camps.push(r.id); this.save.nextRaid += BALANCE.campRaidDelay; this.emit('敵の前哨地を制圧！ 今後の襲撃間隔が延長されました'); } else this.emit('敵の前哨地を再制圧。補給物資を確保しました'); this.save.gold += Math.round((BALANCE.loot.resourceBase + r.min * BALANCE.loot.resourceGrowth) * 8); this.save.materials[r.resource] += amount; }
    p.done = true; this.ring(p, '#e5d694', 65); this.persist();
  }
  equipmentDrop(guaranteed = false) {
    if (this.endless) {
      if (!guaranteed && Math.random() > this.endlessProfile.rare) return;
      this.awardShards((ENDLESS.shardDropBase + this.endlessStage * ENDLESS.shardDropPerStage) * this.endlessProfile.reward);
      this.awardMaterial('crystal', ENDLESS.rewards.rareCrystal); this.save.endless.rewards.rareDrops++;
      this.emit('超越の欠片を発見！ エンドレス専用の恒久鍛造に使用できます'); return;
    }
 if (!guaranteed && Math.random() > BALANCE.drop.equipment) return; const slot = (['weapon', 'armor', 'charm'] as const)[Math.floor(Math.random() * 3)]; const sourceLevel = this.mode === 'expedition' ? REGIONS[this.region].min : Math.min(this.danger, Math.max(4, ...this.save.bosses.map(id => REGIONS[id].max))); const tier = Math.min(BALANCE.equipmentMax, Math.max(1, Math.floor(sourceLevel / BALANCE.progression.dropDivisor) + 1 + (Math.random() < BALANCE.progression.dropRareChance ? BALANCE.progression.dropRareBonus : 0))); if (tier > this.save.equipment[slot]) { this.save.equipment[slot] = tier; this.emit(`${slot === 'weapon' ? '武器' : slot === 'armor' ? '防具' : '護符'} +${tier} を入手・自動装備！`); } else this.save.gold += 15 + tier * 8; }
  experience(amount: number, sourceLevel = this.mode === 'expedition' ? REGIONS[this.region].min : this.danger) { const gap = Math.max(0, this.save.level - sourceLevel - BALANCE.progression.xpGapGrace); const multiplier = Math.max(BALANCE.progression.xpFloor, 1 - gap * BALANCE.progression.xpGapDecay); const levels = gainXp(this.save, amount * multiplier * (this.mode === 'expedition' && this.prepared ? 1 + BALANCE.progression.supplyXp : 1)); if (levels) { this.hero.hp = this.stats.hp; this.ring(this.hero, '#e3f6ae', 120); sfx.play('levelUp'); this.emit(`LEVEL UP！ Lv.${this.save.level} — HP全回復・基礎能力上昇`); } }
  damage(e: Enemy, amount: number, hero = false) {
    if (e.hp <= 0) return;
    const crit = hero && Math.random() < this.stats.crit;
    if (!hero && ['boss', 'elite', 'hunter', 'siege'].includes(e.kind)) amount *= BALANCE.defense.eliteResistance;
    amount *= crit ? BALANCE.equipment.critDamage : 1; e.hp -= amount; e.hit = .12; if (hero && e.hp > 0) sfx.play('hit');
    this.float(e, `${crit ? '✦ ' : ''}${Math.round(amount)}`, crit ? '#fbea93' : '#fff4d9');
    if (e.hp <= 0) {
      sfx.play(e.kind === 'boss' ? 'bossDefeat' : 'kill');
      const stats = this.enemyPower(e.kind, e.level); const bonus = 1 + this.base.upgrades.storage * BALANCE.defense.storage;
      this.awardGold(Math.round(stats.gold * bonus)); sfx.play('coin', .05); this.save.kills++; this.experience(stats.xp, e.level);
      if (Math.random() < BALANCE.drop.material) this.awardMaterial(this.mode === 'base' ? 'wood' : REGIONS[this.region].resource, materialYield(this.mode === 'base' ? 'wood' : REGIONS[this.region].resource, Math.ceil((1 + (this.endless ? ENDLESS.firstLevel : e.level) / 8) * bonus)));
      if (e.level >= 28 && Math.random() < BALANCE.drop.crystal) this.awardMaterial('crystal', 1);
      if (['elite', 'boss'].includes(e.kind)) this.equipmentDrop(e.kind === 'boss');
      this.ring(e, ENEMIES[e.kind].color, 27, .3);
      if (this.mode === 'expedition') {
        this.expeditionKills++;
        if (e.kind === 'boss' && this.endless) {
          this.bossDefeated = true; this.save.endless.bestDanger = Math.max(this.save.endless.bestDanger, this.endlessRound);
          this.awardGold(ENDLESS.rewards.bossGold); this.awardMaterial(REGIONS[this.region].resource, ENDLESS.rewards.bossMaterial); this.awardShards(ENDLESS.clearShards * this.endlessProfile.reward);
          this.persist(); this.emit('危険度 ' + this.endlessRound + ' クリア！ 次の危険度へ進むか帰還できます');
        } else if (e.kind === 'boss') { this.bossDefeated = true; if (!this.save.bosses.includes(this.region)) this.save.bosses.push(this.region); this.save.materials[REGIONS[this.region].resource] += materialYield(REGIONS[this.region].resource, BALANCE.loot.bossMaterial + REGIONS[this.region].min); this.emit(`${REGIONS[this.region].boss}を討伐！ 地域報酬を獲得しました`); if (this.region === 10) { this.save.completed = true; this.emit('地平を喰らう王を討伐！ 世界に新しい朝が訪れました。旅はこの先も続けられます'); } this.persist(); }
      }
    }
  }
  float(at: Vec, text: string, color: string) { if (this.effects.length < 160) this.effects.push({ ...at, text, color, life: .85, max: .85, radius: 0 }); }
  ring(at: Vec, color: string, radius: number, life = .45) { this.effects.push({ ...at, color, radius, life, max: life }); }
  shoot(from: Vec, target: Vec, damage: number, enemy = false, splash = 0, hero = false) { const a = Math.atan2(target.y - from.y, target.x - from.x); const speed = enemy ? 215 : 630; this.bullets.push({ ...from, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, damage, life: enemy ? 3 : 1, enemy, hero, splash, color: enemy ? '#f2b192' : splash ? '#ffd391' : '#faf2b6' }); }
  hurt(amount: number) { if (this.hero.invulnerable > 0) return; amount *= 1 - this.stats.damageReduction; if (this.mode === 'expedition' && this.prepared) amount *= 1 - BALANCE.progression.supplyDamageReduction; this.hero.hp -= amount; this.hero.invulnerable = .33; sfx.play('hurt'); this.float(this.hero, `−${Math.ceil(amount)}`, '#ffb6a0'); if (this.save.settings.shake) this.shake = .12; }
  die(baseLost = false) {
    sfx.play('gameOver');
    const loss = Math.floor(this.save.gold * BALANCE.deathGoldLoss); this.save.gold -= loss;
    this.endless = null; this.intermission = 0; this.mode = 'base'; this.waveActive = false; this.spawnLeft = 0; this.enemies = []; this.bullets = []; this.effects = []; this.hero.x = 800; this.hero.y = 960; this.hero.hp = this.stats.hp; this.hero.invulnerable = 3; this.base.hp = baseMaxHp(this.base); this.save.raidPending = false; this.save.raidTime = BALANCE.raidCountdown; this.save.nextRaid = this.save.elapsed + this.raidInterval(); this.makeWorld();
    this.emit(`${baseLost ? '拠点が陥落' : '戦闘不能'}。仲間に救助されました。コイン −${loss}（装備・素材は保持）`); this.persist();
  }
  raidInterval() { return BALANCE.raidInterval + Math.min(BALANCE.progression.maxRaidDelay, this.save.camps.length * BALANCE.campRaidDelay); }
  update(dt: number) {
    if (this.paused || this.overlay) return;
    dt = Math.min(dt, .05); this.clock += dt; this.save.elapsed += dt; if (this.endless) this.save.nextRaid += dt; this.autoSave += dt; this.shake = Math.max(0, this.shake - dt);
    if (this.autoSave > BALANCE.autoSaveSeconds) { this.autoSave = 0; this.persist(); }
    for (const key of ['cd', 'dash', 'skill', 'potion', 'invulnerable', 'dashTime'] as const) this.hero[key] = Math.max(0, this.hero[key] - dt);
    let dx = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0) + this.joystick.x;
    let dy = (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) + this.joystick.y;
    const length = Math.hypot(dx, dy); if (length > 0) { dx /= Math.max(1, length); dy /= Math.max(1, length); this.lastDirection = { x: dx, y: dy }; if (dx) this.hero.facing = Math.sign(dx); }
    if (this.hero.dashTime > 0) { dx = this.lastDirection.x * 3.7; dy = this.lastDirection.y * 3.7; }
    const movement=this.expeditionMap ? moveOnMap(this.hero,dx*this.stats.speed*dt,dy*this.stats.speed*dt,this.expeditionMap) : {x:clamp(this.hero.x+dx*this.stats.speed*dt,35,1565),y:clamp(this.hero.y+dy*this.stats.speed*dt,35,1565)};
    this.hero.x=movement.x;this.hero.y=movement.y;
    this.hero.hp = Math.min(this.hero.hp, this.stats.hp);
    if (this.mode === 'expedition' && this.prepared) this.hero.hp = Math.min(this.stats.hp, this.hero.hp + this.stats.hp * this.base.upgrades.healer * BALANCE.progression.healerFieldRegen * dt);
    if (this.mode === 'base' && distance(this.hero, { x: 800, y: 800 }) < 210) { this.hero.hp = Math.min(this.stats.hp, this.hero.hp + this.stats.hp * dt * (this.waveActive ? this.base.upgrades.healer * BALANCE.defense.healing : BALANCE.defense.resting)); if (!this.waveActive) this.base.hp = Math.min(baseMaxHp(this.base), this.base.hp + baseMaxHp(this.base) * dt * BALANCE.defense.repair); }
    if (!this.endless && this.save.expeditionUnlocked && this.save.elapsed >= this.save.nextRaid && !this.waveActive && !this.save.raidPending) {
      const power = (this.base.upgrades.soldiers + this.base.upgrades.tower * 2 + this.base.upgrades.cannon * 3) * (1 + this.save.bases[0].upgrades.training * BALANCE.progression.garrisonTraining) + this.base.upgrades.wall * BALANCE.progression.wallRaidDefense + this.base.upgrades.healer * BALANCE.progression.healerRaidDefense;
      this.save.raids++;
      if (this.save.raids % 3 !== 0 && power >= this.danger * .45 && this.base.hp > baseMaxHp(this.base) * .6) { this.base.hp -= baseMaxHp(this.base) * .15 / (1 + this.base.upgrades.wall * BALANCE.progression.raidDamageWallReduction); this.save.nextRaid = this.save.elapsed + this.raidInterval() * .6; this.emit('守備隊が小規模な襲撃を撃退しました。探索を続けられます'); }
      else { this.save.raidPending = true; this.save.raidTime = BALANCE.raidCountdown; this.emit('大規模な襲撃の予兆！ 75秒以内に拠点へ帰還してください'); }
    }
    if (this.save.raidPending && !this.waveActive) { this.save.raidTime -= dt; if (this.save.raidTime <= 0) { if (this.mode === 'expedition') this.returnHome(true); else this.startWave(); } }
    if (this.endless === 'defense' && !this.waveActive) { this.intermission -= dt; if (this.intermission <= 0) this.startWave(); }
    if (this.mode === 'base' && this.waveActive) {
      this.spawnTimer -= dt;
      if (this.spawnLeft > 0 && this.spawnTimer <= 0 && (!this.endless || this.enemies.length < ENDLESS.liveEnemyLimit)) { this.spawn(); this.spawnLeft--; this.spawnTimer = this.endless ? this.endlessProfile.interval : Math.max(.48, 1.25 - this.base.wave * .035); if (this.spawnLeft === 0 && (this.endless ? this.endlessRound % ENDLESS.bossEvery === 0 : (this.base.wave + 1) % 3 === 0)) this.spawn('boss'); else if (this.spawnLeft === 0 && (this.endless || this.base.wave > 2)) this.spawn('elite'); }
      if (this.spawnLeft === 0 && this.enemies.every(e => e.hp <= 0)) {
        if (this.endless === 'defense') {
          this.waveActive = false; this.save.endless.bestWave = Math.max(this.save.endless.bestWave, this.endlessRound);
          const reward = this.awardGold(ENDLESS.rewards.waveGold); this.awardMaterial('iron', ENDLESS.rewards.waveIron); this.awardMaterial('crystal', ENDLESS.rewards.waveCrystal); this.awardShards(ENDLESS.clearShards * this.endlessProfile.reward);
          this.emit('エンドレス WAVE ' + this.endlessRound + ' CLEAR！ +' + reward + ' コイン');
          this.endlessRound++; this.intermission = ENDLESS.intermission; this.bullets = []; this.persist();
        } else {
        this.waveActive = false; this.base.wave++; const reward = BALANCE.waveReward + Math.min(BALANCE.progression.waveGoldCap, this.base.wave) * BALANCE.progression.waveGoldGrowth + this.danger * 7; this.save.supplies = Math.min(BALANCE.progression.supplyCap, this.save.supplies + BALANCE.progression.supplyReward); this.save.gold += reward;
        if (this.base.wave >= 3 && !this.save.expeditionUnlocked) { this.save.expeditionUnlocked = true; this.save.nextRaid = this.save.elapsed + this.raidInterval(); sfx.play('unlock'); this.emit('草原の主を撃破！ 遠征マップが解放されました。すべての地域へ出発できます'); }
        else this.emit(`WAVE ${this.base.wave} CLEAR！ 防衛報酬 +${reward} コイン・補給 +${BALANCE.progression.supplyReward}`);
        this.save.raidPending = false; this.save.raidTime = BALANCE.raidCountdown; this.save.nextRaid = this.save.elapsed + this.raidInterval(); this.persist();
        }
      }
    }
    if (this.mode === 'expedition') {
      this.spawnClock -= dt;
      if (this.spawnClock <= 0 && !(this.endless && this.bossDefeated) && this.enemies.length < (this.endless ? Math.min(ENDLESS.liveEnemyLimit, this.endlessProfile.count) : 24)) { this.spawn(); if (Math.random() < .27) this.spawn('swarm'); this.spawnClock = this.endless ? this.endlessProfile.interval : 2.3; }
      if (this.expeditionKills >= this.bossTarget && !this.bossSpawned) { this.bossSpawned = true; this.spawn('boss', this.expeditionMap?.nodes.boss ?? { x: 800, y: 260 }); this.emit(`${REGIONS[this.region].boss}が北の広場に出現！ 赤い予兆を回避してください`); }
    }
    const targets = this.hero.cd>0 ? [] : this.enemies.filter(e => e.hp > 0 && distance(e, this.hero) < this.stats.range && (!this.expeditionMap || clearPath(this.hero,e,this.expeditionMap,2))).sort((a, b) => distance(a, this.hero) - distance(b, this.hero));
    if (this.hero.cd <= 0 && targets[0]) { this.shoot(this.hero, targets[0], this.stats.attack, false, 0, true); sfx.play('attack'); this.hero.cd = this.stats.interval; this.hero.facing = targets[0].x >= this.hero.x ? 1 : -1; }
    if (this.mode === 'base') { this.allyClock -= dt; if (this.allyClock <= 0) { const d = BALANCE.defense; this.allyClock = d.interval; const u = this.base.upgrades; const strength = (this.endless ? masteryMultiplier(this.save) : 1) * (d.attack + this.save.level * d.attackPerLevel) * (1 + this.save.bases[0].upgrades.training * d.training); for (let i = 0; i < u.soldiers + u.tower + u.cannon; i++) { const pos = this.allyPosition(i); const target = this.enemies.filter(e => e.hp > 0 && distance(e, pos) < (i >= u.soldiers ? d.towerRange : d.soldierRange)).sort((a, b) => distance(a, pos) - distance(b, pos))[0]; if (target) this.shoot(pos, target, strength * (i >= u.soldiers + u.tower ? d.cannonDamage : 1), false, i >= u.soldiers + u.tower ? d.cannonRadius : 0); } } }
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const st = this.enemyPower(e.kind, e.level); e.cd -= dt; e.hit = Math.max(0, e.hit - dt);
      const toHero = this.mode === 'expedition' || ['hunter', 'boss', 'elite', 'bomber'].includes(e.kind) || (e.kind !== 'siege' && distance(e, this.hero) < 170);
      const target = toHero ? this.hero : { x: 800, y: 800 }; const dist = distance(e, target); let a = Math.atan2(target.y - e.y, target.x - e.x);
      if (e.guard && distance(e, this.hero) > 360) continue;
      if (e.patrol && e.hp === e.maxHp && distance(e, this.hero) > EXPLORATION.patrolRange) continue;
      if (this.expeditionMap) {
        e.navClock=(e.navClock??0)-dt;
        if(e.navClock<=0) {e.sight=clearPath(e,target,this.expeditionMap);e.route=e.sight?[{x:target.x,y:target.y}]:routeWaypoints(e,target,this.expeditionMap);e.navClock=.6;}
        while(e.route && e.route.length>1 && distance(e,e.route[0])<22)e.route.shift();
        if(!e.sight && e.route?.length) a=Math.atan2(e.route[0].y-e.y,e.route[0].x-e.x);
      }
      if (e.kind === 'boss' || e.kind === 'elite') {
        e.phase -= dt;
        if (e.phase <= 0 && e.warning <= 0 && (!this.expeditionMap || e.sight)) { e.warning = 1.15; e.target = { x: this.hero.x, y: this.hero.y }; e.phase = e.kind === 'boss' ? 4.3 : 6; }
        if (e.warning > 0) { e.warning -= dt; if (e.warning <= 0) { this.ring(e.target, '#ee8b76', e.kind === 'boss' ? 115 : 75); if (distance(this.hero, e.target) < (e.kind === 'boss' ? 115 : 75)) this.hurt(st.attack * 2); if (e.kind === 'boss') for (let n = 0; n < 8; n++) this.shoot(e, { x: e.x + Math.cos(n * Math.PI / 4) * 100, y: e.y + Math.sin(n * Math.PI / 4) * 100 }, st.attack * .6, true); } continue; }
      }
      const stop = e.kind === 'ranged' ? 230 : toHero ? 25 : 65;
      if (dist > stop || (this.expeditionMap && !e.sight)) { const moved=this.expeditionMap ? moveOnMap(e,Math.cos(a)*st.speed*dt,Math.sin(a)*st.speed*dt,this.expeditionMap) : {x:e.x+Math.cos(a)*st.speed*dt,y:e.y+Math.sin(a)*st.speed*dt};e.x=moved.x;e.y=moved.y; }
      if (dist <= stop + 12 && e.cd <= 0 && (!this.expeditionMap || clearPath(e,target,this.expeditionMap,2))) {
        e.cd = e.kind === 'ranged' ? 1.7 : 1.05;
        if (e.kind === 'ranged') this.shoot(e, target, st.attack, true);
        else { if (toHero) this.hurt(st.attack); else this.base.hp -= st.attack / ((1 + this.base.upgrades.base * BALANCE.progression.baseDamageReduction) * (this.endless ? masteryMultiplier(this.save) : 1)); if (e.kind === 'bomber') { this.ring(e, '#edaa6d', 65); this.damage(e, e.hp, true); } }
      }
    }
    for (const b of this.bullets) {
      const next={x:b.x+b.vx*dt,y:b.y+b.vy*dt};
      if(this.expeditionMap && !clearPath(b,next,this.expeditionMap,2)){b.life=0;continue;}
      b.x=next.x;b.y=next.y;b.life-=dt;
      if (b.enemy) { if (distance(b, this.hero) < 18) { this.hurt(b.damage); b.life = 0; } else if (this.mode === 'base' && distance(b, { x: 800, y: 800 }) < 50) { this.base.hp -= b.damage / ((1 + this.base.upgrades.base * BALANCE.progression.baseDamageReduction) * (this.endless ? masteryMultiplier(this.save) : 1)); b.life = 0; } }
      else { const e = this.enemies.find(e => e.hp > 0 && distance(e, b) < ENEMIES[e.kind].radius + 8); if (e) { this.damage(e, b.damage, b.hero); if (b.splash) { this.ring(b, '#e9bc77', b.splash); for (const other of this.enemies) if (other !== e && distance(other, b) < b.splash) this.damage(other, b.damage * BALANCE.defense.splashDamage); } b.life = 0; } }
    }
    this.enemies = this.enemies.filter(e => e.hp > 0); this.bullets = this.bullets.filter(b => b.life > 0);
    for (const e of this.effects) { e.life -= dt; if (e.text) e.y -= dt * 30; }
    this.effects = this.effects.filter(e => e.life > 0);
    if (this.hero.hp <= 0 || this.base.hp <= 0) this.die(this.base.hp <= 0);
    this.revisionClock += dt; if (this.revisionClock > .12) { this.revisionClock = 0; this.onChange(); }
  }
  allyPosition(i: number) { const u = this.base.upgrades; if (i < u.soldiers) { const a = i * Math.PI * 2 / Math.max(1, u.soldiers) + this.clock * .15; return { x: 800 + Math.cos(a) * 135, y: 800 + Math.sin(a) * 135 }; } const n = i - u.soldiers; const a = n * Math.PI * 2 / Math.max(1, u.tower + u.cannon) - Math.PI / 4; return { x: 800 + Math.cos(a) * 170, y: 800 + Math.sin(a) * 170 }; }
}
export function distance(a: Vec, b: Vec) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

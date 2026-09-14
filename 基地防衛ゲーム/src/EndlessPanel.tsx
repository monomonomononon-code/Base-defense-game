import { useState } from 'react';
import { Infinity, Shield, Compass, Gem, ArrowRight, Hammer } from 'lucide-react';
import { ENDLESS, buyMastery, endlessUnlocked, masteryCost, masteryMultiplier } from './game/endless';
import type { Game } from './game/engine';
import { sfx } from './game/audio';

const fmt = (n: number) => n >= 1e9 ? n.toExponential(2) : Math.floor(n).toLocaleString('ja-JP');
export default function EndlessPanel({ game: g }: { game: Game }) {
  const [expanded, setExpanded] = useState(false);
  const s = g.save, e = s.endless, unlocked = endlessUnlocked(s), cost = masteryCost(s);
  const canStart = g.mode === 'base' && !g.waveActive && !s.raidPending && !g.endless;
  return <section className={`endless-panel ${g.endless ? 'running' : ''}`} aria-label="エンドレスモード">
    <div className="endless-title"><Infinity size={25}/><div><small>BEYOND LEVEL 55</small><h2>果てなき地平</h2></div><button className="subtle-btn" onClick={() => setExpanded(!expanded)}>{expanded ? '詳細を閉じる' : 'エンドレスモード'}</button></div>
    {!unlocked ? <p>Lv55到達 ＋ 最終ボス討伐で解禁。{s.completed ? 'ボス討伐済み — Lv55を目指そう。' : '拠点と旅人の力を育て、その先へ。'}</p> : <>
      <div className="endless-records"><span>防衛最高 <b>Wave {fmt(e.bestWave)}</b></span><span>遠征最高 <b>危険度 {fmt(e.bestDanger)}</b></span><span><Gem size={13}/>超越の欠片 <b>{fmt(e.shards)}</b></span></div>
      {g.endless && <div className="endless-active"><strong>{g.endless === 'defense' ? `エンドレス防衛 WAVE ${g.endlessRound}` : `エンドレス遠征 危険度 ${g.endlessRound}`}</strong><p>敵 Lv.{fmt(g.danger)} · 報酬 ×{g.endlessProfile.reward.toFixed(2)} · エリートレア率 {(g.endlessProfile.rare * 100).toFixed(1)}%</p><div>{g.endless === 'expedition' ? <button className="primary-btn" disabled={!g.bossDefeated} onClick={() => g.nextEndless()}>{g.bossDefeated ? '次の危険度へ' : `ボス出現まで ${Math.min(g.expeditionKills, g.bossTarget)} / ${g.bossTarget}`}<ArrowRight size={14}/></button> : <span>{g.waveActive ? `残り ${g.spawnLeft + g.enemies.length} 体` : `次のWaveまで ${Math.ceil(g.intermission)}秒`}</span>}<button className="subtle-btn" onClick={() => g.leaveEndless()}>報酬を持って帰還</button></div></div>}
      {(expanded || !g.endless) && <div className="endless-options">
        <div><Shield size={21}/><h3>エンドレス防衛</h3><p>既存拠点を守る連続戦。{ENDLESS.bossEvery}Waveごとにボス、次の段階で敵・報酬が強化。</p><button className="subtle-btn" disabled={!canStart} onClick={() => g.startEndless('defense')}>Wave {fmt(e.bestWave + 1)} から挑戦</button>{e.bestWave > 0 && <button className="endless-retry" disabled={!canStart} onClick={() => g.startEndless('defense', true)}>Wave 1 から周回</button>}</div>
        <div><Compass size={21}/><h3>エンドレス遠征</h3><p>11地域を再構成した探索。資源と守護者の配置が変化し、ボス討伐で次の危険度へ。</p><button className="subtle-btn" disabled={!canStart} onClick={() => g.startEndless('expedition')}>危険度 {fmt(e.bestDanger + 1)} から挑戦</button>{e.bestDanger > 0 && <button className="endless-retry" disabled={!canStart} onClick={() => g.startEndless('expedition', true)}>危険度 1 から周回</button>}</div>
      </div>}
      {(expanded || !g.endless) && <div className="endless-forge"><div><h3><Hammer size={16}/>超越鍛造 +{fmt(e.mastery)}</h3><p>エンドレス内の攻撃・HP・守備隊威力・拠点の実効耐久 ×{masteryMultiplier(s).toFixed(2)}。上限なし。本編の能力は変わりません。</p><small>費用 {fmt(cost.gold)} コイン / 欠片 {fmt(cost.shards)}</small></div><button className="primary-btn" disabled={g.mode !== 'base' || g.waveActive || s.gold < cost.gold || e.shards < cost.shards} onClick={() => { if (buyMastery(s)) { sfx.play('upgrade'); g.persist(); g.emit('超越鍛造を強化しました。次の挑戦へ！'); } else sfx.play('error'); }}>超越鍛造を強化</button></div>}
      {expanded && <p className="endless-history">累計獲得：{fmt(e.rewards.gold)} コイン / 木材 {fmt(e.rewards.wood)} / 鉄 {fmt(e.rewards.iron)} / 結晶 {fmt(e.rewards.crystal)} / 欠片 {fmt(e.rewards.shards)} / レア発見 {fmt(e.rewards.rareDrops)}回<br/>最高記録はクリア済みのWave・危険度。帰還・再読込後は最高記録の次から再挑戦できます。挑戦中は本編の襲撃タイマーが停止します。</p>}
      {!canStart && !g.endless && <p>拠点へ帰還し、進行中の防衛・襲撃を解決すると出発できます。</p>}
    </>}
  </section>;
}

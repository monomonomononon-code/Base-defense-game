import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = name => JSON.parse(readFileSync(`docs/simulation/${name}.json`, 'utf8'));
const practicedFile = read('final-practiced'), practiced = practicedFile.results, casual = read('final-casual').results, baseline = read('baseline').results;
const omissions = readdirSync('docs/simulation').filter(p => /^omit-.*\.json$/.test(p)).map(p => read(p.slice(0,-5)));
for (const file of [practicedFile, read('final-casual'), ...omissions]) for (const [path, hash] of Object.entries(file.sourceHashes)) {
  if (createHash('sha256').update(readFileSync(path)).digest('hex') !== hash) throw new Error(`Simulation is stale: ${path}. Run npm run simulate:all.`);
}
const mixed = practiced.filter(r => !['defense-only', 'expedition-only'].includes(r.style));
const median = a => { const s = [...a].sort((a,b)=>a-b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length/2-1] + s[s.length/2]) / 2; };
const range = (a, digits = 1) => `${Math.min(...a).toFixed(digits)}〜${Math.max(...a).toFixed(digits)}`;
const pretty = n => Math.round(n).toLocaleString('ja-JP');
const label = { balanced:'バランス型', offense:'火力型', fortress:'防衛投資型', mobility:'機動型', 'second-base':'第二拠点移住型', 'defense-only':'防衛だけ', 'expedition-only':'遠征偏重（必須防衛のみ）' };
const items = { attack:'攻撃力', speed:'攻撃速度', range:'射程', health:'最大HP', move:'移動速度', soldiers:'兵士', training:'訓練', wall:'防壁', tower:'弓塔', cannon:'砲台', healer:'回復施設', storage:'倉庫', forge:'鍛冶屋', base:'拠点Lv', weapon:'武器鍛造', armor:'防具鍛造', charm:'護符鍛造', skill:'スキル強化' };
const regions = ['平原','森林','廃村','鉱山','湿地','荒野','山岳','雪原','廃都市','汚染地帯','終焉の要塞'];
const normal = [...mixed, ...casual], balanced = practiced.filter(r=>r.style==='balanced');
const successful = normal.filter(r=>r.level===55&&r.completed);
const table = [...new Set(practiced.map(r=>r.style))].map(style=> {
  const a = practiced.filter(r=>r.style===style), old = baseline.filter(r=>r.style===style), c = casual.filter(r=>r.style===style);
  return `| ${label[style]} | ${old.length ? range(old.map(r=>r.minutes)) : '未計測'} | ${range(a.map(r=>r.minutes))}${style==='defense-only'?'（打切り）':''} | ${a.filter(r=>r.level===55&&r.completed).length}/${a.length} | ${c.length?range(c.map(r=>r.minutes)):'—'} | ${range(a.map(r=>r.deaths),0)} |`;
}).join('\n');
const milestones = [5,10,15,20,25,30,35,40,45,50,55].map(lv=> {
  const m=balanced.map(r=>r.milestones.find(m=>m.level===lv));
  return `| ${lv} | ${range(m.map(x=>x.minute))} | ${pretty(median(m.map(x=>x.gold)))} | ${range(m.map(x=>x.weapon),0)} | ${range(m.map(x=>x.armor),0)} |`;
}).join('\n');
const regionTable = regions.map((name,id)=> {
  const visits=balanced.map(r=>r.visits.find(v=>v.region===id)).filter(Boolean);
  const fights=balanced.flatMap(r=>r.visits.filter(v=>v.region===id&&v.bossFightSeconds!==undefined).map(v=>v.bossFightSeconds));
  return `| ${name} | ${range(visits.map(v=>v.level),0)} | ${range(visits.map(v=>v.bossBurstFraction*100),0)}% | ${fights.length?median(fights).toFixed(1):'—'}秒 |`;
}).join('\n');
const omitTable = omissions.map(file=> {
  const a=file.results, item=a[0].omit;
  const delta=median(a.map(r=>r.minutes-casual.find(c=>c.style==='balanced'&&c.seed===r.seed).minutes));
  return `| ${items[item]} | ${a.filter(r=>r.level===55&&r.completed).length}/${a.length} | ${delta>=0?'+':''}${delta.toFixed(2)}分 | ${range(a.map(r=>r.deaths),0)} |`;
}).join('\n');
const stages = [6,12,18].map(rank=> {
  const a=balanced.map(r=>r.milestones.find(m=>m.weapon>=rank)).filter(Boolean);
  return `| 武器 +${rank} | Lv.${range(a.map(m=>m.level),0)} | ${range(a.map(m=>m.minute))}分 | ×${(1+rank/6*.13).toFixed(2)} |`;
}).join('\n');
const support = [...new Set(mixed.map(r=>r.style))].map(style=> {
  const a=mixed.filter(r=>r.style===style);
  return `| ${label[style]} | ${range(a.map(r=>r.garrisonDamageShare*100),0)}% | ${range(a.map(r=>r.baseMinutes))}分 | ${range(a.map(r=>r.waves),0)} |`;
}).join('\n');
const text=`# Lv1→55 バランス監査・調整結果

## 結論

実ゲームエンジンによる最終109条件（本編55条件＋購入除外54条件）を実行しました。通常の往復プレイと第二拠点移住を含む **${successful.length}/${normal.length}条件がLv55・最終ボス討伐に到達**。進行を止める所持金・素材の循環依存は、この範囲では見つかりませんでした。

主要4ビルドの熟練操作モデルは **${range(mixed.filter(r=>r.style!=='second-base').map(r=>r.level55Minute))}分**、反応遅れを含むモデルは **${range(casual.map(r=>r.level55Minute))}分**でLv55へ到達。初見の道選び・説明確認・操作習熟は十分には再現しないため、実ユーザー向けの設計上の目安は **60〜90分**とします。この目安は人間による実測値ではありません。

最終ボス初討伐とLv55到達は別です。バランス型の初討伐は${range(balanced.map(r=>r.completeMinute))}分、Lv55は${range(balanced.map(r=>r.level55Minute))}分。装備と操作で格上に勝てる設計を保ち、クリア後のLv55育成は任意としています。

## 方法・再現性

- 開始状態は新規セーブLv1。経験値・コイン・素材・装備・解禁の直接注入はありません。
- ゲーム本体の50ms更新、敵AI、弾の命中、スキル、ダメージ、購入、ドロップ、帰還、襲撃を利用。無描画・保存なしで高速実行します。
- 熟練モデル：150msごとに移動判断。一般操作近似：650ms、予兆を20%見逃し、弾の専用横回避なし、13秒ごとに0.9秒立ち止まります。
- 購入は公開価格・素材・発見条件を守り、方針別の優先度で選択。買わなかった場合は残金を他へ配分します。装備ドロップは維持するので「武器鍛造なし」は「武器なし」ではありません。
- 乱数seedは本編17/41/89/123/2026、購入除外17/41/89。防衛準備5秒、遠征準備12秒を加算。
- 6時間、またはレベル・発見が20分更新されなければ打切り。打切りは数学的な進行不能の証明ではありません。
- JSONには各Lv、訪問・ボス戦、購入時刻・金額、残資源、死亡、終了セーブと、ゲーム・シミュレーターのSHA-256を記録。レポート生成時に現行ソースと照合します。
- 固定方針・既知の地点へ向かうプログラムであり、人間の楽しさ、全ての進路、全端末、全ビルドを証明するものではありません。

実行：

~~~sh
npm run simulate:all
npm run simulate -- example balanced 17 casual
npm run simulate:report
npm run balance
~~~

## 1. 進行不能・片方だけで済む問題

| 方針 | 調整前のLv55時間 | 調整後の時間 | Lv55＋クリア | 一般操作近似 | 熟練モデルの戦闘不能数 |
| --- | --- | --- | --- | --- | --- |
${table}

調整前は遠征偏重が約11分で最速、防衛のみでも約13分でLv55へ到達。解禁を使う期間が短すぎ、施設を育てる目的が弱くなっていました。

防衛のみでは現在、Lv51で20分更新なしとなり打切り。遠征の発見を一切取らず、武器・防具+4で滞留するケースです。コインは残るため、遠征へ方針を変えれば解消できます。低レベル狩りの経験値を最少8%まで減らし、防衛装備のドロップ帯も実際の地域討伐に連動させました。低Lvエリアへの入場を禁止する変更はしていません。

遠征偏重でも攻略可能ですが、初期防衛と襲撃対応は必要で、往復型より遅く、終盤の残金と強化の空白が大きくなります。防衛成功で補給2個を得て、1遠征に1個使用。補給は攻撃+25%以上・経験値+20%・被ダメージ−12%、施設による追加支援を与えます。入場料や強制レベル制限にはしていません。

## 2. 急な強さ・簡単すぎる区間

敵HP成長を1.075→1.085、基本HPを1.7倍、ボスHPをさらに2.1倍にして、後半が一瞬で終わる問題を抑制。一方、ダメージ成長は1.105→1.097へ下げ、終盤の非予兆攻撃まで過剰な即死になる傾向を緩和しました。高速型・追跡者はLvとともに速くなり、移動・射程への投資が効きます。

| 地域 | 初訪問Lv（バランス型） | 初訪問時のボス予兆1発 / 最大HP | ボス出現から討伐までの中央値 |
| --- | --- | --- | --- |
${regionTable}

予兆ダメージは防具節目・補給軽減込みの計算値で、通常攻撃や被弾率とは異なります。100%超の地域は回避すべき山場として残しています。ボス時間には接近移動や周辺敵への対処も含み、成功戦だけを集計しています。

Lv1〜5は操作と最初の雇用、鉱山は鍛冶屋と+6武器、山岳は砲台・+14鍛造、廃都市は最終鍛造、汚染地帯は結晶上位強化が中心。地域ごとの敵役割や予兆を変えず、均一な難易度にはしていません。

## 3. 経験値・コイン・素材

必要経験値を「75＋32×(Lv−1)＋10.5×(Lv−1)²」に変更。低Lv帯は素早く進み、後半は1地域で装備を試す時間を確保しました。経験値不足による往復型の停止はなし。Lv55以降は既存仕様どおり経験値を保持せず、上限超過を通貨へ変換もしません。

| Lv | 到達分数 | 到達時の所持金中央値 | 武器 | 防具 |
| --- | --- | --- | --- | --- |
${milestones}

終盤のコインは敵のLv倍率を0.17→0.11に調整。防衛のウェーブ番号由来の報酬増分は20ウェーブで頭打ちにしました。バランス型の最後の残金は${range(balanced.map(r=>r.gold),0)}、購入総額中央値は${pretty(median(balanced.map(r=>r.purchases.reduce((n,p)=>n+p.gold,0))))}です。強化した直後の少額残金は、進行不能とは扱っていません。

調整途中には結晶が約9,000個余る例がありました。鉄の取得量を基準の45%、結晶を18%にし、Lv10以降の上位強化は結晶を実消費するよう変更。最終バランス型の結晶残高は${range(balanced.map(r=>r.materials.crystal),0)}。全強化MAXを強制せず、クリア後の伸びしろとして残す量です。防衛だけ・遠征だけに偏る場合のコイン余りは残り、未投資分野へ回す余地があります。

## 4. 「次の強化」を待つテンポ

バランス型の購入間隔の最大値は${range(balanced.map(r=>r.maxPurchaseGap))}分。帰還時に複数購入するモデルなので、「毎分1個だけ買う」意味ではありません。小さな強化は短い間隔、装備名が変わる大きな節目は複数回の遠征ごとに置きました。

| 節目 | 初到達Lv | 到達時刻 | 最終攻撃への追加係数 |
| --- | --- | --- | --- |
${stages}

武器+6「遊撃の銃」、+12「地平の銃」、+18「暁光の銃」で明確な強さの跳躍。防具も+6/+12/+18で6%/12%/18%の被ダメージ軽減が付きます。武器は現在1系統の段階成長で、別々の攻撃方式を持つ武器一覧ではありません。

装備価格倍率を1.42→1.30へ緩和し、鍛冶屋が鍛造費を1段階3.5%、最大35%下げるよう変更。ドロップを地域Lv/3からLv/4基準に抑え、12%の上振れ+2を残しました。拾う楽しみを保ちつつ、最上位は鍛造する意味があります。

鉱山+12→廃都市+18の間に強化空白があったため、山岳発見で+14を追加。第二拠点への移住も全5seedで成立し、恒久強化の二重割引を避け、28%割引は現地施設・兵士へ適用します。

## 5. 買う意味の薄い強化とビルド偏重

以下は各強化だけを購入しない一般操作近似モデルの比較です。同じseed・操作モデルのバランス型との差の中央値。資金配分、経路、ドロップ列も変わるため、時間差を単独能力の厳密な因果効果とはみなしません。

| 購入しない項目 | Lv55＋クリア | 所要時間差 | 戦闘不能数 |
| --- | --- | --- | --- |
${omitTable}

攻撃速度・射程の放置は特に不利ですが、最終条件ではそれらを買わないケースもクリア可能。火力型だけが唯一の解ではなく、主要4型は全seedで成立します。

防具鍛造・回復・防壁・弓塔などは、最短時間だけなら省く方が速いケースを残しています。全購入を必須にするための価格ペナルティは加えていません。防具はHPと節目軽減、回復施設は回復量・CT・補給中の持続回復、防壁は拠点HPと留守番被害軽減、訓練は実射撃に加えて留守番判定・補給弾へ作用します。状況や腕前に対する保険として扱います。

| 方針 | 防衛中の守備隊与ダメージ割合 | 防衛・準備に使った時間 | 防衛成功回数 |
| --- | --- | --- | --- |
${support}

兵士・弓塔・砲台は主人公が常時守るモデルでも防衛火力に寄与しています。エリート・ボスへの守備隊減衰42%は維持し、全てを施設任せにしない方針です。施設を1つ省いた比較だけで「効果ゼロ」とは結論しません。

## 6. 残している山場と限界

- 知らない高Lv地域への進入は自由。低Lvの格上エリート予兆は引き続き致命的です。
- 鉱山・山岳の敵構成変更、武器節目、廃都市鍛造、汚染地帯の上位解放を山場として維持。
- 攻略速度では火力型が優位。防衛投資型との差は、最終熟練モデル中央値で${((median(practiced.filter(r=>r.style==='fortress').map(r=>r.minutes))/median(practiced.filter(r=>r.style==='offense').map(r=>r.minutes))-1)*100).toFixed(1)}%。同じ時間に揃える調整はしていません。
- 最終ボスを早く倒すプレイヤーには、Lv55到達まで任意の育成が残ります。Lv55を入場・クリア条件にしていません。
- 全109条件は疑似プレイヤーの結果です。楽しさの実証には初見ユーザーのプレイテストが必要です。実際の死亡地点・離脱Lv・購入履歴を計測するオンライン収集機能は今回追加していません。

## 成果物

- 数値・効果：src/game/data.ts、src/game/state.ts、src/game/engine.ts
- 再実行：scripts/simulate-campaign.ts、scripts/run-balance-audit.mjs
- 比較レポート生成：scripts/report-balance.mjs
- 生ログ：docs/simulation/baseline.json、final-practiced.json、final-casual.json、omit-*.json
- 全Lv数値：docs/levels.csv
`;
writeFileSync('docs/balance-audit.md', text);
console.log(`Wrote docs/balance-audit.md; ${successful.length}/${normal.length} mixed-route runs reached Lv55 and completed.`);
if (successful.length !== normal.length) process.exitCode = 1;


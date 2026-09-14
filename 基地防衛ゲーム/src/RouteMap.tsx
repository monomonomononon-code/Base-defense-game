import { useEffect, useRef } from 'react';
import type { Game } from './game/engine';
import { drawMinimap } from './game/render';
export default function RouteMap({ game }: { game: Game }) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=ref.current?.getContext('2d');if(ctx) drawMinimap(ctx,game,360);},[game]);
  return <div className="route-map-panel"><p>{game.expeditionMap?.name} · 北が主の広場 / 南が帰還地点</p><canvas ref={ref} width={360} height={360} aria-label="遠征ルート詳細。赤い直通路、緑の資源外周路、金の宝箱路と紫の袋小路が分岐・合流します"/><ul><li><b>赤：短い危険路</b> — 敵が多く、前哨地を通って主の広場へ</li><li><b>緑：資源の回り道</b> — 敵が少なめ。2か所で採取</li><li><b>金：宝箱ルート</b> — 敵が多め。守護エリートの先に装備</li><li><b>紫：袋小路</b> — 発見イベント。帰りは合流路へ</li></ul><p>明るい道・広場・橋を通って進みます。暗い森や岩場は通行不可。回避も地形を越えません。主は{game.bossTarget}体討伐で出現。地図を開いている間は一時停止します。</p></div>;
}

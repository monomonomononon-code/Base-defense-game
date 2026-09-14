export const MOBILE_NOTICE_LIMIT = 2;

export function compactNotice(text: string) {
  const level = text.match(/LEVEL UP！\s*Lv\.(\d+)/);
  if (level) return `LEVEL UP！ Lv.${level[1]}`;
  const equipment = text.match(/^(武器|防具|護符)\s*\+(\d+)\s*を入手/);
  if (equipment) return `${equipment[1]} +${equipment[2]} を入手！`;
  if (text.includes('地平を喰らう王を討伐')) return '最終ボス撃破！';
  if (text.startsWith('発見：')) return text.split(' — ')[0];
  if (text.includes('遠征マップが解放')) return '遠征マップ解放！';
  if (text.length <= 26) return text;
  return `${text.slice(0, 25)}…`;
}

/** Keeps each finger's role independent so movement survives skill touches. */
export class MobilePointers {
  private movement: number | null = null;
  private skills = new Set<number>();

  beginMovement(pointerId: number) {
    if (this.movement !== null) return false;
    this.movement = pointerId;
    return true;
  }

  isMovement(pointerId: number) { return this.movement === pointerId; }

  endMovement(pointerId: number) {
    if (!this.isMovement(pointerId)) return false;
    this.movement = null;
    return true;
  }

  beginSkill(pointerId: number) {
    if (this.skills.has(pointerId)) return false;
    this.skills.add(pointerId);
    return true;
  }

  endSkill(pointerId: number) { this.skills.delete(pointerId); }

  clear() { this.movement = null; this.skills.clear(); }
}

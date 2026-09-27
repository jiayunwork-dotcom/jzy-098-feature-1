/**
 * 自动机状态图的分层换行布局（纯函数，不依赖 DOM）。
 *
 * - 从初态沿有向边做 BFS，BFS 距离决定"逻辑层"
 * - 逻辑层从左到右排，每行最多 MAX_PER_ROW 层，排满后下一行继续从左侧开始；
 *   这样超长的连接型正则（如电话号码）会折成多行，而不是横向无限延伸
 * - 同层多个状态在纵向上铺开，并以该行最大层高为基准居中
 * - 编号/边相同则坐标完全相同，逐步演示时状态不会跳动
 * - 跨行的边交给 EdgeView 用贝塞尔曲线绘制
 */

export interface LayoutEdge {
  from: number;
  to: number;
}

export interface Point {
  x: number;
  y: number;
}

export const LAYER_GAP = 180;
export const ROW_GAP = 110;
export const MARGIN_X = 90;
export const MARGIN_Y = 80;
export const ROW_BLOCK_GAP = 70;
/** 每行最多放几个逻辑层，超过则折到下一行（长连接正则不至于横向无限延伸） */
export const MAX_PER_ROW = 7;

export function layoutAutomaton(
  states: number[],
  edges: LayoutEdge[],
  start: number,
): Map<number, Point> {
  const adjacency = new Map<number, number[]>();
  for (const e of edges) {
    const list = adjacency.get(e.from);
    if (list) list.push(e.to);
    else adjacency.set(e.from, [e.to]);
  }

  // 有向 BFS 决定逻辑层号
  const level = new Map<number, number>();
  level.set(start, 0);
  const queue = [start];
  while (queue.length) {
    const s = queue.shift()!;
    for (const t of adjacency.get(s) ?? []) {
      if (!level.has(t)) {
        level.set(t, (level.get(s) ?? 0) + 1);
        queue.push(t);
      }
    }
  }
  let maxLevel = 0;
  for (const l of level.values()) maxLevel = Math.max(maxLevel, l);
  for (const s of states) {
    if (!level.has(s)) level.set(s, maxLevel + 1);
  }
  maxLevel = Math.max(...[...level.values()]);

  // 逻辑层 -> 物理（行、列）：每行从左到右，排满换行
  const rowOf = (lvl: number) => Math.floor(lvl / MAX_PER_ROW);
  const colOf = (lvl: number) => lvl % MAX_PER_ROW;

  const cells = new Map<string, number[]>();
  for (const s of states) {
    const lvl = level.get(s) ?? 0;
    const key = `${rowOf(lvl)}:${colOf(lvl)}`;
    const list = cells.get(key);
    if (list) list.push(s);
    else cells.set(key, [s]);
  }

  // 每行的最大层高（用于该行内部纵向居中）
  const rowTallest = new Map<number, number>();
  for (const [key, members] of cells) {
    const row = Number(key.split(':')[0]);
    rowTallest.set(row, Math.max(rowTallest.get(row) ?? 1, members.length));
  }

  const positions = new Map<number, Point>();
  for (const s of states) {
    const lvl = level.get(s) ?? 0;
    const row = rowOf(lvl);
    const col = colOf(lvl);
    const key = `${row}:${col}`;
    const members = cells.get(key)!;
    members.sort((a, b) => a - b);
    const idx = members.indexOf(s);
    const tallest = rowTallest.get(row)!;
    const offset = ((tallest - members.length) * ROW_GAP) / 2;
    const rowBase = MARGIN_Y + row * (tallest * ROW_GAP + ROW_BLOCK_GAP);
    positions.set(s, {
      x: MARGIN_X + col * LAYER_GAP,
      y: rowBase + offset + idx * ROW_GAP,
    });
  }

  return positions;
}

export function graphSize(positions: Map<number, Point>): {
  width: number;
  height: number;
} {
  let width = MARGIN_X * 2;
  let height = MARGIN_Y * 2;
  for (const p of positions.values()) {
    width = Math.max(width, p.x + MARGIN_X);
    height = Math.max(height, p.y + MARGIN_Y);
  }
  return { width, height };
}

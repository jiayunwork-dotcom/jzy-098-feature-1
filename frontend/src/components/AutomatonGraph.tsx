/**
 * AutomatonGraph：三台机器共用的状态图绘制组件（纯 SVG）。
 *
 * 约定：
 * - 状态是圆圈，接受态双圈，初态左侧有黑点 + 箭头
 * - 转移是带标签的有向边；同 from/to 的多条标签合并成一条逗号分隔边
 * - 自环画在节点上方；回边（目标层更靠左）向下弯
 * - 未出现在 visibleStates 中的状态与相关边不绘制（Thompson 逐步拼装用）
 * - activeStates / activeEdges / partition 分别负责处理高亮与等价类着色
 * - traceBadges：逐字符回放时在状态上标出"读到第几个字符后到达"
 */

import { useMemo, useRef, useState } from 'react';
import type { Symbol } from '../lib/types';
import {
  graphSize,
  layoutAutomaton,
  ROW_GAP,
  type LayoutEdge,
  type Point,
} from './automatonLayout';

const RADIUS = 26;
const PARTITION_COLORS = [
  '#e8f1fb',
  '#fdecec',
  '#e9f7ec',
  '#fdf3e0',
  '#f1ebfb',
  '#e0f7f6',
  '#fbeaf3',
  '#eef0f2',
  '#f5f7dc',
  '#e6f0ff',
  '#fff0f5',
  '#eafaea',
];

export interface TraceBadge {
  state: number;
  index: number;
}

interface AutomatonGraphProps {
  states: number[];
  accepting: number[];
  start: number;
  /** 合并后的显示边（NFA 的 ε/多标签边已在后端分组；DFA 传入时也会被再次合并） */
  edges: {
    from: number;
    to: number;
    labels: Symbol[];
    /** 原始边身份，用于 activeEdgeKeys 判定 */
    key?: string;
  }[];
  statePrefix: string;
  visibleStates?: number[];
  activeStates?: number[];
  /** 高亮的边，key 形如 "from->to"（同 from/to 的标签边一起高亮） */
  activeEdgeKeys?: string[];
  partition?: Record<number, number>;
  dimmedStates?: number[];
  traceBadges?: TraceBadge[];
  epsilonSymbol?: string;
}

export function formatSymbol(s: Symbol): string {
  if (s === '\n') return '\\n';
  if (s === '\t') return '\\t';
  if (s === '\r') return '\\r';
  if (s === ' ') return '␣';
  if (s === '\0') return '\\0';
  return s;
}

export function AutomatonGraph(props: AutomatonGraphProps) {
  const {
    states,
    accepting,
    start,
    edges,
    statePrefix,
    visibleStates,
    activeStates,
    activeEdgeKeys,
    partition,
    dimmedStates,
    traceBadges,
  } = props;

  // ---- 合并同 from/to 的 DFA 标签边 ----
  const groupedEdges = useMemo(() => {
    const map = new Map<string, { from: number; to: number; labels: Symbol[] }>();
    for (const e of edges) {
      const key = `${e.from}->${e.to}`;
      const g = map.get(key);
      if (g) {
        for (const l of e.labels) if (!g.labels.includes(l)) g.labels.push(l);
      } else {
        map.set(key, { from: e.from, to: e.to, labels: [...e.labels] });
      }
    }
    return [...map.values()].map((g) => {
      const order = (l: Symbol) => (l === 'ε' || l === 'epsilon' ? 1 : 0);
      g.labels.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
      return { ...g, key: `${g.from}->${g.to}` };
    });
  }, [edges]);

  const visibleSet = useMemo(
    () => new Set(visibleStates ?? states),
    [visibleStates, states],
  );

  // 布局始终按完整机器计算，保证逐步出现时坐标不跳动
  const layoutEdges: LayoutEdge[] = useMemo(
    () => groupedEdges.map((e) => ({ from: e.from, to: e.to })),
    [groupedEdges],
  );
  const positions = useMemo(
    () => layoutAutomaton(states, layoutEdges, start),
    [states, layoutEdges, start],
  );
  const size = useMemo(() => graphSize(positions), [positions]);

  const activeSet = new Set(activeStates ?? []);
  const dimmedSet = new Set(dimmedStates ?? []);
  const activeEdgeSet = new Set(activeEdgeKeys ?? []);
  const badgeOf = new Map<number, number>();
  for (const b of traceBadges ?? []) {
    if (!badgeOf.has(b.state)) badgeOf.set(b.state, b.index);
  }

  // ---- 简单的滚轮缩放 + 拖拽平移 ----
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView((v) => ({ ...v, scale: Math.min(2.5, Math.max(0.4, v.scale * factor)) }));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setView((v) => ({
      ...v,
      x: d.vx + (e.clientX - d.x),
      y: d.vy + (e.clientY - d.y),
    }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  const resetView = () => setView({ x: 0, y: 0, scale: 1 });

  const visibleEdges = groupedEdges.filter(
    (e) => visibleSet.has(e.from) && visibleSet.has(e.to),
  );

  return (
    <div className="graph-scroll">
      <svg
        ref={svgRef}
        className="automaton-svg"
        width="100%"
        height={Math.min(Math.max(size.height + 80, 360), 560)}
        viewBox={`0 0 ${size.width} ${size.height}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#5a6472" />
          </marker>
          <marker
            id="arrow-active"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e8590c" />
          </marker>
        </defs>

        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {/* 初态标记：黑点 + 指向初态的箭头 */}
          {visibleSet.has(start) && <StartMarker point={positions.get(start)!} />}

          {visibleEdges.map((e) => {
            const isActive = activeEdgeSet.has(e.key);
            return (
              <EdgeView
                key={e.key}
                edge={e}
                from={positions.get(e.from)!}
                to={positions.get(e.to)!}
                active={isActive}
              />
            );
          })}

          {states
            .filter((s) => visibleSet.has(s))
            .map((s) => {
              const p = positions.get(s)!;
              const isAccept = accepting.includes(s);
              const isActive = activeSet.has(s);
              const isDimmed = dimmedSet.has(s);
              const group = partition?.[s];
              const fill =
                group !== undefined
                  ? PARTITION_COLORS[group % PARTITION_COLORS.length]
                  : isActive
                    ? '#fff0e6'
                    : '#ffffff';
              const stroke = isActive ? '#e8590c' : '#3a4250';
              return (
                <g key={s} className={isDimmed ? 'state-dimmed' : undefined}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={RADIUS}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isActive ? 3 : 2}
                  />
                  {isAccept && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={RADIUS - 6}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={2}
                    />
                  )}
                  <text
                    x={p.x}
                    y={p.y + 5}
                    textAnchor="middle"
                    className="state-label"
                    fill="#21252c"
                  >
                    {statePrefix}
                    {s}
                  </text>
                  {badgeOf.has(s) && (
                    <g>
                      <circle cx={p.x + RADIUS - 4} cy={p.y - RADIUS + 4} r={11} fill="#1971c2" />
                      <text
                        x={p.x + RADIUS - 4}
                        y={p.y - RADIUS + 8}
                        textAnchor="middle"
                        className="badge-label"
                        fill="#fff"
                      >
                        {badgeOf.get(s)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
        </g>
      </svg>
      <button type="button" className="btn btn-small graph-reset" onClick={resetView}>
        重置视图
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StartMarker({ point }: { point: Point }) {
  const dotX = point.x - RADIUS - 34;
  const arrowStart = dotX + 7;
  const arrowEnd = point.x - RADIUS - 2;
  return (
    <g>
      <circle cx={dotX} cy={point.y} r={5} fill="#21252c" />
      <line
        x1={arrowStart}
        y1={point.y}
        x2={arrowEnd}
        y2={point.y}
        stroke="#5a6472"
        strokeWidth={2}
        markerEnd="url(#arrow)"
      />
    </g>
  );
}

interface EdgeViewProps {
  edge: { from: number; to: number; labels: Symbol[]; key: string };
  from: Point;
  to: Point;
  active: boolean;
}

function EdgeView({ edge, from, to, active }: EdgeViewProps) {
  const color = active ? '#e8590c' : '#5a6472';
  const width = active ? 3 : 1.6;
  const marker = active ? 'url(#arrow-active)' : 'url(#arrow)';
  const labelText = edge.labels.map(formatSymbol).join(', ');

  let path: string;
  let labelX: number;
  let labelY: number;

  if (edge.from === edge.to) {
    // 自环：节点上方的环
    const cx = from.x;
    const cy = from.y - RADIUS - 20;
    path = `M ${cx - 15} ${from.y - RADIUS + 4}
            C ${cx - 34} ${cy + 8}, ${cx + 34} ${cy + 8}, ${cx + 15} ${from.y - RADIUS + 4}`;
    labelX = cx;
    labelY = cy - 6;
  } else {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    // 起止点贴到圆边
    const sx = from.x + ux * RADIUS;
    const sy = from.y + uy * RADIUS;
    const tx = to.x - ux * (RADIUS + 8);
    const ty = to.y - uy * (RADIUS + 8);

    if (to.y - from.y > ROW_GAP * 0.9 && Math.abs(dx) > 20) {
      // 折行跨行边：走"S 形"贝塞尔，从行尾下到下一行行首
      const midY = (sy + ty) / 2;
      path = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
      labelX = (sx + tx) / 2;
      labelY = midY - 4;
    } else if (to.x < from.x - 20) {
      // 回边（同层向左）：向下弯的大弧线
      const midX = (sx + tx) / 2;
      const bend = 60;
      const cx = midX;
      const cy = Math.max(sy, ty) + bend;
      path = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
      labelX = cx;
      labelY = cy + 4;
    } else {
      // 普通边：略微弧形，平行双向边时上下错开
      const nx = -uy;
      const ny = ux;
      const bend = Math.abs(dy) < 8 ? 0 : 16;
      const cx = (sx + tx) / 2 + nx * bend;
      const cy = (sy + ty) / 2 + ny * bend;
      path = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
      labelX = cx;
      labelY = cy - 6;
    }
  }

  return (
    <g>
      <path d={path} fill="none" stroke={color} strokeWidth={width} markerEnd={marker} />
      <g>
        <rect
          x={labelX - (labelText.length * 7.2) / 2 - 4}
          y={labelY - 11}
          width={labelText.length * 7.2 + 8}
          height={16}
          rx={4}
          fill="#ffffff"
          opacity={0.92}
        />
        <text
          x={labelX}
          y={labelY + 2}
          textAnchor="middle"
          className="edge-label"
          fill={color}
        >
          {labelText}
        </text>
      </g>
    </g>
  );
}

/**
 * ProductGraph：答案对拍的"组合状态图"。
 *
 * 每个圆圈是一个组合状态 (Li, Rj)——左右两台机器同步读到当前串后各自所在状态；
 * 圆圈用四种底色/描边区分接受性：
 *   绿底双圈   both      两边都接受
 *   蓝底       leftOnly  只有左边接受（左 \\ 右 反例落点）
 *   橙底       rightOnly 只有右边接受（右 \\ 左 反例落点）
 *   白底       neither   两边都不接受
 * 含显式死状态的组合额外用虚线描边并在角上标 ✕，方便解释"读到没见过的符号就分岔"。
 *
 * 步进高亮：
 *   currentState  —— 本步正在展开（粗橙圈）
 *   newState      —— 本步新发现（黄色外发光）
 *   frontier      —— 待处理队列（蓝色虚线外环）
 */

import { useMemo, useRef, useState } from 'react';
import type { ProductStateDTO, Symbol } from '../lib/types';
import {
  graphSize,
  layoutAutomaton,
  ROW_GAP,
  type LayoutEdge,
  type Point,
} from './automatonLayout';
import { formatSymbol } from './AutomatonGraph';

const RADIUS = 30;

const CATEGORY_STYLE: Record<
  ProductStateDTO['category'],
  { fill: string; stroke: string; label: string; double: boolean }
> = {
  both: { fill: '#d3f9d8', stroke: '#2b8a3e', label: '两边都接受', double: true },
  leftOnly: { fill: '#d0ebff', stroke: '#1864ab', label: '只有左边接受', double: false },
  rightOnly: { fill: '#ffe8cc', stroke: '#d9480f', label: '只有右边接受', double: false },
  neither: { fill: '#ffffff', stroke: '#495057', label: '两边都不接受', double: false },
};

interface ProductGraphProps {
  states: ProductStateDTO[];
  start: number;
  transitions: { from: number; symbol: Symbol; to: number }[];
  currentState: number | null;
  newState: number | null;
  frontier: number[];
  leftDead: number;
  rightDead: number;
  /** 已确认的两个反例组合状态 id（在图上常驻标记） */
  leftOnlyStateId?: number | null;
  rightOnlyStateId?: number | null;
}

export function ProductGraph({
  states,
  start,
  transitions,
  currentState,
  newState,
  frontier,
  leftDead,
  rightDead,
  leftOnlyStateId,
  rightOnlyStateId,
}: ProductGraphProps) {
  // 合并同 from/to 的边标签
  const groupedEdges = useMemo(() => {
    const map = new Map<string, { from: number; to: number; labels: Symbol[] }>();
    for (const t of transitions) {
      const key = `${t.from}->${t.to}`;
      const g = map.get(key);
      if (g) {
        if (!g.labels.includes(t.symbol)) g.labels.push(t.symbol);
      } else {
        map.set(key, { from: t.from, to: t.to, labels: [t.symbol] });
      }
    }
    return [...map.values()].map((g) => {
      g.labels.sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
      return { ...g, key: `${g.from}->${g.to}` };
    });
  }, [transitions]);

  const ids = useMemo(() => states.map((s) => s.id), [states]);
  const layoutEdges: LayoutEdge[] = useMemo(
    () => groupedEdges.map((e) => ({ from: e.from, to: e.to })),
    [groupedEdges],
  );
  const positions = useMemo(
    () => layoutAutomaton(ids, layoutEdges, start),
    [ids, layoutEdges, start],
  );
  const size = useMemo(() => graphSize(positions), [positions]);

  const stateById = useMemo(() => new Map(states.map((s) => [s.id, s])), [states]);
  const frontierSet = useMemo(() => new Set(frontier), [frontier]);

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
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  const resetView = () => setView({ x: 0, y: 0, scale: 1 });

  return (
    <div className="graph-scroll">
      <svg
        ref={svgRef}
        className="automaton-svg"
        width="100%"
        height={Math.min(Math.max(size.height + 100, 360), 620)}
        viewBox={`0 0 ${size.width} ${size.height}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
      >
        <defs>
          <marker id="cmp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#5a6472" />
          </marker>
          <marker id="cmp-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e8590c" />
          </marker>
        </defs>

        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {positions.has(start) && <StartMarker point={positions.get(start)!} />}

          {groupedEdges.map((e) => {
            const active =
              currentState !== null &&
              e.from === currentState;
            return (
              <EdgeView
                key={e.key}
                edge={e}
                from={positions.get(e.from)!}
                to={positions.get(e.to)!}
                active={active}
              />
            );
          })}

          {ids.map((id) => {
            const s = stateById.get(id)!;
            const p = positions.get(id)!;
            const style = CATEGORY_STYLE[s.category];
            const isCurrent = id === currentState;
            const isNew = id === newState;
            const inQueue = frontierSet.has(id);
            const involvesDead = s.left === leftDead || s.right === rightDead;
            const isLeftWitness = id === leftOnlyStateId;
            const isRightWitness = id === rightOnlyStateId;
            const stroke = isCurrent ? '#e8590c' : style.stroke;
            return (
              <g key={id}>
                {inQueue && (
                  <circle cx={p.x} cy={p.y} r={RADIUS + 8} fill="none"
                    stroke="#1971c2" strokeWidth={1.6} strokeDasharray="4 3" />
                )}
                {isNew && (
                  <circle cx={p.x} cy={p.y} r={RADIUS + 6} fill="none"
                    stroke="#f59f00" strokeWidth={4} opacity={0.55}>
                    <animate attributeName="r" values={`${RADIUS + 3};${RADIUS + 8};${RADIUS + 3}`} dur="1.2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={RADIUS}
                  fill={style.fill}
                  stroke={stroke}
                  strokeWidth={isCurrent ? 3.5 : 2}
                  strokeDasharray={involvesDead ? '5 3' : undefined}
                />
                {style.double && (
                  <circle cx={p.x} cy={p.y} r={RADIUS - 6} fill="none" stroke={stroke} strokeWidth={2} />
                )}
                <text x={p.x} y={p.y + 4} textAnchor="middle" className="state-label" fill="#21252c">
                  L{s.left},R{s.right}
                </text>
                {involvesDead && (
                  <text x={p.x + RADIUS - 6} y={p.y - RADIUS + 7} textAnchor="middle"
                    className="cmp-dead-mark" fill="#862e2e">✕</text>
                )}
                {(isLeftWitness || isRightWitness) && (
                  <g>
                    <circle cx={p.x - RADIUS + 5} cy={p.y - RADIUS + 5} r={10}
                      fill={isLeftWitness ? '#1864ab' : '#d9480f'} />
                    <text x={p.x - RADIUS + 5} y={p.y - RADIUS + 9} textAnchor="middle"
                      className="badge-label" fill="#fff">
                      {isLeftWitness ? 'L' : 'R'}
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

export function ProductLegend() {
  const items: Array<{ key: ProductStateDTO['category']; text: string }> = [
    { key: 'both', text: '两边都接受' },
    { key: 'leftOnly', text: '只有左边接受' },
    { key: 'rightOnly', text: '只有右边接受' },
    { key: 'neither', text: '两边都不接受' },
  ];
  return (
    <div className="cmp-legend">
      {items.map((it) => {
        const st = CATEGORY_STYLE[it.key];
        return (
          <span key={it.key} className="cmp-legend-item">
            <span
              className="cmp-legend-dot"
              style={{ background: st.fill, borderColor: st.stroke, borderStyle: 'solid' }}
            />
            {it.text}
          </span>
        );
      })}
      <span className="cmp-legend-item">
        <span className="cmp-legend-dot" style={{ borderStyle: 'dashed', background: '#fff' }} />
        含显式死状态（✕）
      </span>
      <span className="cmp-legend-item">
        <span className="cmp-legend-ring" style={{ borderColor: '#1971c2' }} />
        待处理队列
      </span>
      <span className="cmp-legend-item">
        <span className="cmp-legend-ring" style={{ borderColor: '#e8590c', borderWidth: 3 }} />
        当前展开
      </span>
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
      <line x1={arrowStart} y1={point.y} x2={arrowEnd} y2={point.y}
        stroke="#5a6472" strokeWidth={2} markerEnd="url(#cmp-arrow)" />
    </g>
  );
}

function EdgeView({
  edge,
  from,
  to,
  active,
}: {
  edge: { from: number; to: number; labels: Symbol[]; key: string };
  from: Point;
  to: Point;
  active: boolean;
}) {
  const color = active ? '#e8590c' : '#5a6472';
  const marker = active ? 'url(#cmp-arrow-active)' : 'url(#cmp-arrow)';
  const labelText = edge.labels.map(formatSymbol).join(',');

  let path: string;
  let labelX: number;
  let labelY: number;

  if (edge.from === edge.to) {
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
    const sx = from.x + ux * RADIUS;
    const sy = from.y + uy * RADIUS;
    const tx = to.x - ux * (RADIUS + 8);
    const ty = to.y - uy * (RADIUS + 8);

    if (to.y - from.y > ROW_GAP * 0.9 && Math.abs(dx) > 20) {
      const midY = (sy + ty) / 2;
      path = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
      labelX = (sx + tx) / 2;
      labelY = midY - 4;
    } else if (to.x < from.x - 20) {
      const midX = (sx + tx) / 2;
      const cx = midX;
      const cy = Math.max(sy, ty) + 60;
      path = `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
      labelX = cx;
      labelY = cy + 4;
    } else {
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
      <path d={path} fill="none" stroke={color} strokeWidth={active ? 3 : 1.6} markerEnd={marker} />
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
        <text x={labelX} y={labelY + 2} textAnchor="middle" className="edge-label" fill={color}>
          {labelText}
        </text>
      </g>
    </g>
  );
}

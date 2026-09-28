/**
 * ProductGraph：答案对拍的组合状态图（两台 DFA 同步运行的乘积自动机）。
 *
 * 与三段演示共用分层布局思路，但节点画成更宽的圆角矩形，里面分两行标明
 * 它由左右各自哪个最小化 DFA 状态组成；死状态分量用 † 表示。
 *
 * 四类组合状态用填充色区分：
 *   both       两边都接受（绿）
 *   left-only  只有左边接受（蓝）
 *   right-only 只有右边接受（橙）
 *   neither    两边都不接受（白/灰）
 *
 * 逐步推进时：当前展开的状态橙色描边、本步新发现状态带"新"角标、
 * 待处理队列虚线描边；反例三机回放时沿见证串在乘积图上画出同步路径。
 */

import { useMemo, useRef, useState } from 'react';
import type {
  ProductAcceptClassDTO,
  ProductStateDTO,
  Symbol,
} from '../lib/types';
import { formatSymbol } from './AutomatonGraph';
import {
  graphSize,
  layoutAutomaton,
  ROW_GAP,
  type Point,
} from './automatonLayout';

const NODE_W = 104;
const NODE_H = 56;
const P_MARGIN_X = 110;
const P_MARGIN_Y = 90;

const CLASS_FILL: Record<ProductAcceptClassDTO, string> = {
  both: '#e9f7ec',
  'left-only': '#e8f1fb',
  'right-only': '#fdf3e0',
  neither: '#ffffff',
};

const CLASS_LABEL: Record<ProductAcceptClassDTO, string> = {
  both: '两边都接受',
  'left-only': '仅左接受',
  'right-only': '仅右接受',
  neither: '两边都不接受',
};

interface RawEdge {
  from: number;
  to: number;
  symbol: Symbol;
}

interface ProductGraphProps {
  states: ProductStateDTO[];
  transitions: RawEdge[];
  start: number;
  leftDead: number;
  rightDead: number;
  visibleStates?: number[];
  currentState?: number | null;
  newState?: number | null;
  frontier?: number[];
  activeEdge?: { from: number; to: number } | null;
  /** 反例回放：见证串在乘积图上走过的状态序列与边 */
  pathStates?: number[];
  pathEdges?: string[];
}

export function ProductGraph(props: ProductGraphProps) {
  const {
    states,
    transitions,
    start,
    leftDead,
    rightDead,
    visibleStates,
    currentState,
    newState,
    frontier,
    activeEdge,
    pathStates,
    pathEdges,
  } = props;

  // 同 from/to 的符号边合并成一条多标签边
  const groupedEdges = useMemo(() => {
    const map = new Map<string, { from: number; to: number; labels: Symbol[] }>();
    for (const e of transitions) {
      const key = `${e.from}->${e.to}`;
      const g = map.get(key);
      if (g) {
        if (!g.labels.includes(e.symbol)) g.labels.push(e.symbol);
      } else {
        map.set(key, { from: e.from, to: e.to, labels: [e.symbol] });
      }
    }
    return [...map.values()].map((g) => {
      g.labels.sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
      return { ...g, key: `${g.from}->${g.to}` };
    });
  }, [transitions]);

  const visibleSet = useMemo(
    () => new Set(visibleStates ?? states.map((s) => s.id)),
    [visibleStates, states],
  );

  // 乘积图布局：节点更宽，层间距/页边距相应放大
  const positions = useMemo(
    () =>
      layoutAutomaton(
        states.map((s) => s.id),
        groupedEdges.map((e) => ({ from: e.from, to: e.to })),
        start,
        { layerGap: 190, marginX: P_MARGIN_X, marginY: P_MARGIN_Y },
      ),
    [states, groupedEdges, start],
  );

  const size = useMemo(
    () => graphSize(positions, P_MARGIN_X, P_MARGIN_Y),
    [positions],
  );

  const frontierSet = new Set(frontier ?? []);
  const pathStateSet = new Set(pathStates ?? []);
  const pathEdgeSet = new Set(pathEdges ?? []);

  // ---- 缩放/拖拽（与 AutomatonGraph 相同的交互） ----
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView((v) => ({ ...v, scale: Math.min(2.5, Math.max(0.35, v.scale * factor)) }));
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

  const visibleEdges = groupedEdges.filter(
    (e) => visibleSet.has(e.from) && visibleSet.has(e.to),
  );

  return (
    <div className="graph-scroll">
      <svg
        ref={svgRef}
        className="automaton-svg"
        width="100%"
        height={Math.min(Math.max(size.height + 60, 320), 620)}
        viewBox={`0 0 ${Math.max(size.width, 320)} ${size.height}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
      >
        <defs>
          <marker id="p-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#5a6472" />
          </marker>
          <marker id="p-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#e8590c" />
          </marker>
          <marker id="p-arrow-path" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#1971c2" />
          </marker>
        </defs>

        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {visibleSet.has(start) && (
            <StartDot point={positions.get(start)!} />
          )}

          {visibleEdges.map((e) => {
            const isCurrent =
              activeEdge && activeEdge.from === e.from && activeEdge.to === e.to;
            const isPath = pathEdgeSet.has(e.key);
            return (
              <ProductEdge
                key={e.key}
                edge={e}
                from={positions.get(e.from)!}
                to={positions.get(e.to)!}
                current={!!isCurrent}
                onPath={isPath}
              />
            );
          })}

          {states
            .filter((s) => visibleSet.has(s.id))
            .map((s) => {
              const p = positions.get(s.id)!;
              const isCurrent = currentState === s.id;
              const isNew = newState === s.id;
              const inQueue = frontierSet.has(s.id);
              const onPath = pathStateSet.has(s.id);
              return (
                <ProductNode
                  key={s.id}
                  state={s}
                  point={p}
                  isCurrent={isCurrent}
                  isNew={isNew}
                  inQueue={inQueue}
                  onPath={onPath}
                  leftDead={leftDead}
                  rightDead={rightDead}
                />
              );
            })}
        </g>
      </svg>
      <button type="button" className="btn btn-small graph-reset" onClick={() => setView({ x: 0, y: 0, scale: 1 })}>
        重置视图
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function componentLabel(stateId: number, deadId: number, prefix: string): string {
  return stateId === deadId ? '†死' : `${prefix}${stateId}`;
}

interface ProductNodeProps {
  state: ProductStateDTO;
  point: Point;
  isCurrent: boolean;
  isNew: boolean;
  inQueue: boolean;
  onPath: boolean;
  leftDead: number;
  rightDead: number;
}

function ProductNode({
  state,
  point,
  isCurrent,
  isNew,
  inQueue,
  onPath,
  leftDead,
  rightDead,
}: ProductNodeProps) {
  const { x, y } = point;
  const fill = CLASS_FILL[state.acceptClass];
  const stroke = isCurrent
    ? '#e8590c'
    : onPath
      ? '#1971c2'
      : '#3a4250';
  const strokeWidth = isCurrent || onPath ? 3 : 1.8;
  const dash = inQueue && !isCurrent ? '6 4' : undefined;

  const leftText = componentLabel(state.left, leftDead, 'M');
  const rightText = componentLabel(state.right, rightDead, 'M');

  return (
    <g>
      <rect
        x={x - NODE_W / 2}
        y={y - NODE_H / 2}
        width={NODE_W}
        height={NODE_H}
        rx={12}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
      />
      <text x={x} y={y - 14} textAnchor="middle" className="product-node-id" fill="#868e96">
        P{state.id}
      </text>
      <text x={x} y={y + 5} textAnchor="middle" className="product-node-pair" fill="#21252c">
        <tspan className={state.left === leftDead ? 'product-dead' : ''}>{leftText}</tspan>
        <tspan dx={6} fill="#adb5bd">,</tspan>
        <tspan dx={6} className={state.right === rightDead ? 'product-dead' : ''}>{rightText}</tspan>
      </text>
      {/* 接受侧小圆点：左点蓝、右点橙、双边都接受两个点 */}
      {(state.acceptClass === 'both' || state.acceptClass === 'left-only') && (
        <circle cx={x - NODE_W / 2 + 9} cy={y - NODE_H / 2 + 9} r={4} fill="#1971c2" />
      )}
      {(state.acceptClass === 'both' || state.acceptClass === 'right-only') && (
        <circle cx={x + NODE_W / 2 - 9} cy={y - NODE_H / 2 + 9} r={4} fill="#e8590c" />
      )}
      {isNew && (
        <g>
          <circle cx={x + NODE_W / 2 - 2} cy={y - NODE_H / 2 + 2} r={10} fill="#2f9e44" />
          <text x={x + NODE_W / 2 - 2} y={y - NODE_H / 2 + 6} textAnchor="middle" className="badge-label" fill="#fff">
            新
          </text>
        </g>
      )}
      <title>{`P${state.id}：(${leftText}, ${rightText})，${CLASS_LABEL[state.acceptClass]}，到达串 ${state.witness === '' ? 'ε（空串）' : `"${state.witness}"`}`}</title>
    </g>
  );
}

function StartDot({ point }: { point: Point }) {
  const dotX = point.x - NODE_W / 2 - 30;
  return (
    <g>
      <circle cx={dotX} cy={point.y} r={5} fill="#21252c" />
      <line
        x1={dotX + 7}
        y1={point.y}
        x2={point.x - NODE_W / 2 - 2}
        y2={point.y}
        stroke="#5a6472"
        strokeWidth={2}
        markerEnd="url(#p-arrow)"
      />
    </g>
  );
}

interface ProductEdgeProps {
  edge: { from: number; to: number; labels: Symbol[]; key: string };
  from: Point;
  to: Point;
  current: boolean;
  onPath: boolean;
}

function ProductEdge({ edge, from, to, current, onPath }: ProductEdgeProps) {
  const color = current ? '#e8590c' : onPath ? '#1971c2' : '#5a6472';
  const width = current || onPath ? 2.8 : 1.6;
  const marker = current
    ? 'url(#p-arrow-active)'
    : onPath
      ? 'url(#p-arrow-path)'
      : 'url(#p-arrow)';
  const labelText = edge.labels.map(formatSymbol).join(', ');

  let path: string;
  let labelX: number;
  let labelY: number;

  if (edge.from === edge.to) {
    const cx = from.x;
    const cy = from.y - NODE_H / 2 - 22;
    path = `M ${cx - 18} ${from.y - NODE_H / 2 + 2}
            C ${cx - 40} ${cy + 10}, ${cx + 40} ${cy + 10}, ${cx + 18} ${from.y - NODE_H / 2 + 2}`;
    labelX = cx;
    labelY = cy - 6;
  } else {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const sx = from.x + ux * (NODE_W / 2 - 6);
    const sy = from.y + uy * (NODE_H / 2 - 6);
    const tx = to.x - ux * (NODE_W / 2 + 8);
    const ty = to.y - uy * (NODE_H / 2 + 8);

    if (to.y - from.y > ROW_GAP * 0.9 && Math.abs(dx) > 30) {
      const midY = (sy + ty) / 2;
      path = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
      labelX = (sx + tx) / 2;
      labelY = midY - 4;
    } else if (to.x < from.x - 24) {
      const midX = (sx + tx) / 2;
      const cy = Math.max(sy, ty) + 64;
      path = `M ${sx} ${sy} Q ${midX} ${cy} ${tx} ${ty}`;
      labelX = midX;
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
        <text x={labelX} y={labelY + 2} textAnchor="middle" className="edge-label" fill={color}>
          {labelText}
        </text>
      </g>
    </g>
  );
}

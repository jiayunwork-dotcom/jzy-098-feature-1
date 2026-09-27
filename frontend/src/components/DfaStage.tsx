/**
 * DfaStage：第二阶段。
 * 子集构造逐步展开：每一步要么在求初始 ε-闭包，要么对某个 DFA 状态
 * 在某个符号上算 move + 闭包。左侧图画当前已发现的状态与转移，
 * 右侧子集对照表同步高亮当前处理的子集行。
 */

import { useMemo } from 'react';
import type { ConstructResultDTO, SimulateResultDTO } from '../lib/types';
import { AutomatonGraph, type TraceBadge } from './AutomatonGraph';
import { StepControls } from './StepControls';
import { SubsetTable } from './SubsetTable';

interface DfaStageProps {
  data: ConstructResultDTO;
  step: number;
  playing: boolean;
  onStepChange: (s: number) => void;
  onPlayingChange: (p: boolean) => void;
  trace: SimulateResultDTO['dfa'] | null;
  traceStep: number;
}

export function DfaStage({
  data,
  step,
  playing,
  onStepChange,
  onPlayingChange,
  trace,
  traceStep,
}: DfaStageProps) {
  const sub = data.dfaSteps[step];

  const visibleStates = sub.rows.map((r) => r.state);
  const edges = useMemo(
    () =>
      sub.transitions.map((t) => ({
        from: t.from,
        to: t.to,
        labels: [t.symbol],
      })),
    [sub.transitions],
  );

  // 当前帧高亮：刚连上的那条转移
  const activeEdgeKeys =
    sub.targetState !== null && sub.symbol !== null
      ? [`${sub.currentState}->${sub.targetState}`]
      : [];

  const traceActive = trace
    ? trace.steps[Math.min(traceStep, trace.steps.length - 1)]
    : null;
  const traceBadges: TraceBadge[] = trace
    ? trace.steps.slice(0, traceStep + 1).map((s) => ({ state: s.state, index: s.index }))
    : [];

  return (
    <section className="stage-card">
      <header className="stage-head">
        <h2>② 子集构造：ε-NFA → DFA</h2>
        <p className="stage-subtitle">
          DFA 的每个状态都是一组 NFA 状态（ε-闭包）；同一子集绝不重复登记。
        </p>
      </header>

      <StepControls
        current={step}
        total={data.dfaSteps.length}
        onChange={onStepChange}
        playing={playing}
        onPlayingChange={onPlayingChange}
        speedMs={800}
      />

      <div className="step-explanation">
        <strong>{sub.title}</strong>
        <p>{sub.description}</p>
      </div>

      <div className="stage-two-col">
        <div className="stage-graph-col">
          <AutomatonGraph
            states={data.dfa.states}
            accepting={data.dfa.accepting}
            start={data.dfa.start}
            edges={edges}
            statePrefix="D"
            visibleStates={visibleStates}
            activeStates={traceActive ? [traceActive.state] : sub.currentState !== null ? [sub.currentState] : []}
            activeEdgeKeys={trace ? trace.steps.slice(0, traceStep + 1).map((s) => s.edgeKey).filter((k): k is string => k !== null) : activeEdgeKeys}
            traceBadges={traceBadges}
          />
        </div>
        <div className="stage-table-col">
          <h3 className="col-title">子集对照表</h3>
          <SubsetTable
            rows={sub.rows}
            currentState={traceActive ? null : sub.currentState}
            newState={traceActive ? null : sub.newState}
            frontier={sub.frontier}
          />
        </div>
      </div>

      {trace && (
        <div className="stage-legend">
          <span className="legend-info">
            DFA 路径：
            {trace.steps
              .slice(0, traceStep + 1)
              .map((s) => `D${s.state}`)
              .join(' → ')}
            {trace.rejectedAt && traceStep >= trace.steps.length - 1 && (
              <em>（在 D{trace.rejectedAt.state} 上读到 "{trace.rejectedAt.symbol}" 时无转移，拒绝）</em>
            )}
          </span>
        </div>
      )}
    </section>
  );
}

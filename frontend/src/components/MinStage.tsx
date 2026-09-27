/**
 * MinStage：第三阶段。
 * Hopcroft 划分细化逐步播放：左图在原 DFA 上按当前划分给状态染组色，
 * 右侧划分表同步显示每个组包含哪些 D 状态；走到最后一步时切换为
 * 折叠后的最小化 DFA（每个等价类变成一个 M 状态）。
 */

import { useMemo } from 'react';
import type { ConstructResultDTO, SimulateResultDTO } from '../lib/types';
import { AutomatonGraph, type TraceBadge } from './AutomatonGraph';
import { StepControls } from './StepControls';
import { PartitionView } from './PartitionView';

interface MinStageProps {
  data: ConstructResultDTO;
  step: number;
  playing: boolean;
  onStepChange: (s: number) => void;
  onPlayingChange: (p: boolean) => void;
  trace: SimulateResultDTO['min'] | null;
  traceStep: number;
}

export function MinStage({
  data,
  step,
  playing,
  onStepChange,
  onPlayingChange,
  trace,
  traceStep,
}: MinStageProps) {
  const hop = data.hopSteps[step];
  // 正在回放测试串时强制展示折叠后的最小化 DFA，路径才有着落
  const isFinal = hop.kind === 'final' || trace !== null;
  const min = data.minDfa;

  const traceActive = trace
    ? trace.steps[Math.min(traceStep, trace.steps.length - 1)]
    : null;
  const traceBadges: TraceBadge[] = trace
    ? trace.steps.slice(0, traceStep + 1).map((s) => ({ state: s.state, index: s.index }))
    : [];
  const traceEdges = trace
    ? trace.steps.slice(0, traceStep + 1).map((s) => s.edgeKey).filter((k): k is string => k !== null)
    : [];

  // 最终一帧：画折叠后的最小化 DFA；其余帧：在原 DFA 上染组色
  const graph = useMemo(() => {
    if (isFinal) {
      return {
        states: min.states,
        accepting: min.accepting,
        start: min.start,
        edges: min.transitions.map((t) => ({ from: t.from, to: t.to, labels: [t.symbol] })),
        prefix: 'M',
      };
    }
    return {
      states: data.dfa.states,
      accepting: data.dfa.accepting,
      start: data.dfa.start,
      edges: data.dfa.transitions.map((t) => ({
        from: t.from,
        to: t.to,
        labels: [t.symbol],
      })),
      prefix: 'D',
    };
  }, [isFinal, min, data.dfa]);

  // 最终帧上若在回放，要把 M 状态上的高亮展示出来
  const activeStates = traceActive ? [traceActive.state] : hop.reason ? [hop.reason.state] : [];

  return (
    <section className="stage-card">
      <header className="stage-head">
        <h2>③ Hopcroft 最小化：DFA → 最小化 DFA</h2>
        <p className="stage-subtitle">
          接受性不同的先分开，再按"读一个符号后落入哪个组"反复细化；同色即等价，最后折叠成一个状态。
        </p>
      </header>

      <StepControls
        current={step}
        total={data.hopSteps.length}
        onChange={onStepChange}
        playing={playing}
        onPlayingChange={onPlayingChange}
        speedMs={1100}
      />

      <div className="step-explanation">
        <strong>{hop.title}</strong>
        <p>{hop.description}</p>
      </div>

      <div className="stage-two-col">
        <div className="stage-graph-col">
          <AutomatonGraph
            states={graph.states}
            accepting={graph.accepting}
            start={graph.start}
            edges={graph.edges}
            statePrefix={graph.prefix}
            partition={isFinal ? undefined : hop.partition}
            activeStates={activeStates}
            activeEdgeKeys={trace ? traceEdges : []}
            traceBadges={isFinal ? traceBadges : []}
          />
          <p className="graph-hint">
            {isFinal
              ? '上图即最小化 DFA；每个 M 状态对应的原 D 状态见下表 members。'
              : '上图仍是原 DFA，颜色表示当前等价类划分；同色状态正在被考虑合并。'}
          </p>
        </div>
        <div className="stage-table-col">
          <h3 className="col-title">
            {isFinal ? '最小化状态 ← 被合并的原状态' : '等价类划分（当前帧）'}
          </h3>
          {isFinal ? (
            <div className="partition-groups">
              {min.states.map((m) => (
                <div key={m} className="partition-card">
                  <div className="partition-card-head">
                    <strong>M{m}</strong>
                    {min.accepting.includes(m) && <span className="tag tag-new">接受态</span>}
                    {m === min.start && <span className="tag tag-current">初态</span>}
                  </div>
                  <div className="partition-members">
                    {min.members[m].map((d) => (
                      <span key={d} className="member-chip">D{d}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <PartitionView
              step={hop}
              totalDfaStates={data.dfa.states.length}
              accepting={data.dfa.accepting}
            />
          )}
        </div>
      </div>

      {trace && isFinal && (
        <div className="stage-legend">
          <span className="legend-info">
            最小化 DFA 路径：
            {trace.steps
              .slice(0, traceStep + 1)
              .map((s) => `M${s.state}`)
              .join(' → ')}
            {trace.rejectedAt && traceStep >= trace.steps.length - 1 && (
              <em>（在 M{trace.rejectedAt.state} 上读到 "{trace.rejectedAt.symbol}" 时无转移，拒绝）</em>
            )}
          </span>
        </div>
      )}
    </section>
  );
}

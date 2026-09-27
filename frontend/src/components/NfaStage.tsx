/**
 * NfaStage：第一阶段。
 * 按 Thompson 构造的后序步骤逐步"拼"出 ε-NFA，当前算子的片段高亮，
 * 并把该算子的语法含义讲清楚。测试串回放时高亮当前活动状态集合。
 */

import { useMemo } from 'react';
import type { ConstructResultDTO, SimulateResultDTO } from '../lib/types';
import { AutomatonGraph } from './AutomatonGraph';
import { StepControls } from './StepControls';

interface NfaStageProps {
  data: ConstructResultDTO;
  step: number;
  playing: boolean;
  onStepChange: (s: number) => void;
  onPlayingChange: (p: boolean) => void;
  trace: SimulateResultDTO['nfa'] | null;
  traceStep: number;
}

export function NfaStage({
  data,
  step,
  playing,
  onStepChange,
  onPlayingChange,
  trace,
  traceStep,
}: NfaStageProps) {
  const thompsonStep = data.nfaSteps[step];

  // 回放测试串时展示完整 NFA，否则只显示截至当前 Thompson 步已拼出的部分
  const visibleStates = trace ? data.nfa.states.map((s) => s.id) : thompsonStep.stateIds;
  const visibleEdges = useMemo(() => {
    if (trace) return data.nfa.graphEdges;
    const idSet = new Set(thompsonStep.edgeIds);
    return data.nfa.graphEdges.filter((g) => g.edgeIds.some((id) => idSet.has(id)));
  }, [trace, data.nfa.graphEdges, thompsonStep.edgeIds]);

  // 轨迹回放：当前前缀下的活动状态集
  const traceActive = trace ? trace.steps[Math.min(traceStep, trace.steps.length - 1)] : null;

  return (
    <section className="stage-card">
      <header className="stage-head">
        <h2>① Thompson 构造：正则 → ε-NFA</h2>
        <p className="stage-subtitle">
          每个算子都对应一个小状态机片段，按语法树后序一片片拼起来；虚线 ε 边不消费字符。
        </p>
      </header>

      <StepControls
        current={step}
        total={data.nfaSteps.length}
        onChange={onStepChange}
        playing={playing}
        onPlayingChange={onPlayingChange}
        speedMs={900}
      />

      <div className="step-explanation">
        <strong>{thompsonStep.title}</strong>
        <p>{thompsonStep.description}</p>
      </div>

      <AutomatonGraph
        states={data.nfa.states.map((s) => s.id)}
        accepting={[data.nfa.accept]}
        start={data.nfa.start}
        edges={visibleEdges}
        statePrefix="s"
        visibleStates={visibleStates}
        activeStates={traceActive ? traceActive.active : thompsonStep.activeStateIds}
        activeEdgeKeys={
          traceActive
            ? []
            : data.nfa.graphEdges
                .filter((g) => g.edgeIds.some((id) => thompsonStep.activeEdgeIds.includes(id)))
                .map((g) => g.id)
        }
      />

      <div className="stage-legend">
        <span><i className="legend-dot" /> 普通状态</span>
        <span><i className="legend-double" /> 接受态（双圈）</span>
        <span><i className="legend-arrow" /> 初态标记</span>
        <span className="legend-active">橙色 = {trace ? '当前活动状态集' : '本步正在拼装的片段'}</span>
        {traceActive && (
          <span className="legend-info">
            读完前 {traceActive.consumed} 个字符后，活动状态集：{'{'}
            {traceActive.active.map((s) => `s${s}`).join(', ') || '∅'}
            {'}'}
          </span>
        )}
      </div>
    </section>
  );
}

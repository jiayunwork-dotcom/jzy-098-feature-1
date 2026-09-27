/**
 * PartitionView：Hopcroft 划分的逐步视图。
 * 表中每个原 DFA 状态显示当前所在组（组号随每帧重排，按组内最小编号稳定排序），
 * 本步被拆开的组与新产生的组醒目标出。
 */

import type { HopStepDTO } from '../lib/types';

const PARTITION_DOTS = [
  '#1971c2', '#e03131', '#2f9e44', '#e8590c',
  '#7048e8', '#0c8599', '#c2255c', '#495057',
  '#94d82d', '#4dabf7', '#f06595', '#51cf66',
];

interface PartitionViewProps {
  step: HopStepDTO;
  totalDfaStates: number;
  accepting: number[];
}

export function PartitionView({ step, totalDfaStates, accepting }: PartitionViewProps) {
  const groupOfStates = new Map<number, number[]>();
  for (let s = 0; s < totalDfaStates; s++) {
    const g = step.partition[s] ?? 0;
    const list = groupOfStates.get(g);
    if (list) list.push(s);
    else groupOfStates.set(g, [s]);
  }
  const groupIds = [...groupOfStates.keys()].sort((a, b) => a - b);

  return (
    <div className="partition-view">
      <div className="partition-groups">
        {groupIds.map((g) => {
          const members = groupOfStates.get(g)!.sort((a, b) => a - b);
          const isNew = step.newGroups.includes(g);
          const isRetained = step.retainedGroup === g;
          return (
            <div
              key={g}
              className={`partition-card ${isRetained ? 'card-retained' : ''} ${
                isNew ? 'card-new' : ''
              }`}
            >
              <div className="partition-card-head">
                <span
                  className="group-dot"
                  style={{ background: PARTITION_DOTS[g % PARTITION_DOTS.length] }}
                />
                <strong>P{g}</strong>
                {isRetained && <span className="tag tag-current">被拆组保留部分</span>}
                {isNew && <span className="tag tag-new">拆出的新组</span>}
              </div>
              <div className="partition-members">
                {members.map((s) => (
                  <span key={s} className="member-chip">
                    D{s}
                    {accepting.includes(s) ? ' ⊙' : ''}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

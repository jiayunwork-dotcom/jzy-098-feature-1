/**
 * SubsetTable：子集构造对照表。
 * 左列是 DFA 状态，右列是它对应的一组 NFA 状态；
 * 当前正在展开的状态、新发现的状态、还在队列里等待处理的状态都做了标记。
 */

import type { SubsetRowDTO } from '../lib/types';

interface SubsetTableProps {
  rows: SubsetRowDTO[];
  currentState: number | null;
  newState: number | null;
  frontier: number[];
}

export function SubsetTable({ rows, currentState, newState, frontier }: SubsetTableProps) {
  const queueSet = new Set(frontier);
  return (
    <div className="subset-table-wrap">
      <table className="subset-table">
        <thead>
          <tr>
            <th>DFA 状态</th>
            <th>= ε-closure/move 得到的 NFA 状态子集</th>
            <th>接受?</th>
            <th>处理状态</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isCurrent = row.state === currentState;
            const isNew = row.state === newState;
            const inQueue = queueSet.has(row.state);
            return (
              <tr
                key={row.state}
                className={[
                  isCurrent ? 'row-current' : '',
                  isNew ? 'row-new' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <td className="cell-dfa">
                  <strong>D{row.state}</strong>
                </td>
                <td className="cell-members">
                  {'{ '}
                  {row.members.map((m) => `s${m}`).join(', ')}
                  {' }'}
                </td>
                <td>{row.accepting ? '✔ 接受' : '—'}</td>
                <td>
                  {isCurrent ? (
                    <span className="tag tag-current">正在展开</span>
                  ) : isNew ? (
                    <span className="tag tag-new">新状态</span>
                  ) : inQueue ? (
                    <span className="tag tag-queue">待处理</span>
                  ) : (
                    <span className="tag tag-done">已处理</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

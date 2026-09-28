/**
 * CompareReplayPanel：反例串在"某一条正则"的三台机器上回放。
 *
 * 对拍结论旁边点"送到回放"后，左右两侧各用一个本面板：
 * 后端 /api/construct 拿三台机器，/api/simulate 拿同一条反例串的轨迹，
 * 横幅直接展示这一侧是接受还是拒绝——两个面板并排时，学生能亲眼看到
 * 同一条串在一边接受、在另一边拒绝。
 *
 * 三台机器的图形复用既有 NfaStage / DfaStage / MinStage，不另画一套。
 */

import { useEffect, useMemo, useState } from 'react';
import { constructRegex, simulateRegex } from '../lib/api';
import type {
  CompareSideDTO,
  ConstructResultDTO,
  SimulateResultDTO,
} from '../lib/types';
import { NfaStage } from './NfaStage';
import { DfaStage } from './DfaStage';
import { MinStage } from './MinStage';

interface CompareReplayPanelProps {
  side: CompareSideDTO;
  /** 该侧对反例串的应有结论（由调用方按左反例/右反例方向确定） */
  accepts: boolean;
  witness: string;
  /** 供其他面板切换输入时触发本面板数据更新 */
  nonce?: number;
}

export function CompareReplayPanel({ side, accepts, witness, nonce }: CompareReplayPanelProps) {
  const [data, setData] = useState<ConstructResultDTO | null>(null);
  const [trace, setTrace] = useState<SimulateResultDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [traceStep, setTraceStep] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [constructed, simulated] = await Promise.all([
          constructRegex(side.regex),
          simulateRegex(side.regex, witness),
        ]);
        if (cancelled) return;
        setData(constructed);
        setTrace(simulated);
        setTraceStep([...witness].length);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // nonce 让"送另一条反例进来"时重新拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side.regex, witness, nonce]);

  const verdictMatches = trace ? trace.nfa.accepted === accepts && trace.agreement : true;

  const headerLabel = useMemo(() => {
    const label = side.regex.length > 28 ? side.regex.slice(0, 28) + '…' : side.regex;
    return label;
  }, [side.regex]);

  return (
    <div className="replay-panel">
      <header className="replay-head">
        <div className="replay-title">
          <span className="replay-side-tag">{accepts ? '接受方' : '拒绝方'}</span>
          <code title={side.regex}>{headerLabel}</code>
        </div>
      </header>

      {loading && <div className="empty-state">正在构造三台机器并回放…</div>}
      {error && (
        <div className="error-box" role="alert">
          <div className="error-message">{error}</div>
        </div>
      )}

      {data && trace && (
        <>
          <div
            className={`verdict-banner ${
              !verdictMatches
                ? 'verdict-conflict'
                : trace.nfa.accepted
                  ? 'verdict-accept'
                  : 'verdict-reject'
            }`}
          >
            {trace.nfa.accepted ? (
              <>
                ✔ 三台机器一致<strong>接受</strong>反例串{' '}
                <code>{witness === '' ? 'ε（空串）' : witness}</code>
              </>
            ) : (
              <>
                ✘ 三台机器一致<strong>拒绝</strong>反例串{' '}
                <code>{witness === '' ? 'ε（空串）' : witness}</code>
              </>
            )}
          </div>

          <div className="replay-strip">
            <span className="char-strip" aria-label="逐字符回放">
              <span className={`char-chip ${traceStep === 0 ? 'chip-current' : ''}`}>起点</span>
              {[...witness].map((ch, i) => {
                const cls = [
                  'char-chip',
                  i + 1 <= traceStep ? 'chip-consumed' : '',
                  i + 1 === traceStep ? 'chip-current' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <span key={i} className={cls}>
                    {ch === ' ' ? '␣' : ch === '\n' ? '\\n' : ch === '\t' ? '\\t' : ch}
                    <sub>{i + 1}</sub>
                  </span>
                );
              })}
            </span>
            {witness.length > 0 && (
              <input
                type="range"
                min={0}
                max={[...witness].length}
                value={traceStep}
                onChange={(e) => setTraceStep(Number(e.target.value))}
                className="step-slider replay-slider"
                aria-label="回放进度"
              />
            )}
          </div>

          <div className="replay-machines">
            <details className="replay-machine" open>
              <summary>NFA</summary>
              <NfaStage
                data={data}
                step={0}
                playing={false}
                onStepChange={() => undefined}
                onPlayingChange={() => undefined}
                trace={trace.nfa}
                traceStep={traceStep}
              />
            </details>
            <details className="replay-machine" open>
              <summary>DFA</summary>
              <DfaStage
                data={data}
                step={data.dfaSteps.length - 1}
                playing={false}
                onStepChange={() => undefined}
                onPlayingChange={() => undefined}
                trace={trace.dfa}
                traceStep={traceStep}
              />
            </details>
            <details className="replay-machine" open>
              <summary>最小化 DFA</summary>
              <MinStage
                data={data}
                step={data.hopSteps.length - 1}
                playing={false}
                onStepChange={() => undefined}
                onPlayingChange={() => undefined}
                trace={trace.min}
                traceStep={traceStep}
              />
            </details>
          </div>
        </>
      )}
    </div>
  );
}

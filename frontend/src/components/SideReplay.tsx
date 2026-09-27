/**
 * SideReplay：对拍反例在"一条正则的三台机器"上的回放面板。
 * 点反例旁边的按钮后，由 CompareView 并行把两边的 construct 都取回来，
 * 本组件只负责对给定 regex+input 调 /api/simulate，然后复用三段舞台展示轨迹。
 */

import { useEffect, useState } from 'react';
import type { ConstructResultDTO, SimulateResultDTO } from '../lib/types';
import { simulateRegex } from '../lib/api';
import { NfaStage } from './NfaStage';
import { DfaStage } from './DfaStage';
import { MinStage } from './MinStage';
import { StepControls } from './StepControls';

interface SideReplayProps {
  title: string;
  data: ConstructResultDTO;
  input: string;
  /** 这条串在本侧是否被接受（由对拍结论保证，横幅使用） */
  accepted: boolean;
  /** 回放结束后通知父组件把整条串的三机 accept 汇总（用于自检） */
}

export function SideReplay({ title, data, input, accepted }: SideReplayProps) {
  const [trace, setTrace] = useState<SimulateResultDTO | null>(null);
  const [traceStep, setTraceStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTrace(null);
    simulateRegex(data.regex, input)
      .then((r) => {
        if (cancelled) return;
        setTrace(r);
        setTraceStep([...input].length);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data, input]);

  const chars = [...input];

  return (
    <section className="side-replay">
      <header className="side-replay-head">
        <h3>{title}</h3>
        <code className="side-replay-regex">{data.regex}</code>
        <span className={`tag ${accepted ? 'tag-new' : 'tag-current'}`}>
          {accepted ? '接受 ✔' : '拒绝 ✘'}
        </span>
      </header>

      {loading && <p className="panel-hint">正在三台机器上回放…</p>}
      {error && (
        <div className="error-box" role="alert">
          <div className="error-message">回放失败：{error}</div>
        </div>
      )}

      {trace && (
        <>
          <div
            className={`verdict-banner ${
              trace.agreement
                ? trace.nfa.accepted
                  ? 'verdict-accept'
                  : 'verdict-reject'
                : 'verdict-conflict'
            }`}
          >
            {trace.agreement ? (
              trace.nfa.accepted ? (
                <>✔ 三台机器一致<strong>接受</strong>该串</>
              ) : (
                <>✘ 三台机器一致<strong>拒绝</strong>该串</>
              )
            ) : (
              <>⚠ 三台机器结论不一致！</>
            )}
          </div>

          <div className="char-strip" aria-label="逐字符回放">
            <span className={`char-chip ${traceStep === 0 ? 'chip-current' : ''}`}>起点</span>
            {chars.map((ch, i) => {
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
          </div>
          <StepControls
            current={traceStep}
            total={chars.length + 1}
            onChange={setTraceStep}
            playing={playing}
            onPlayingChange={setPlaying}
            speedMs={700}
          />

          <div className="side-replay-machines">
            <NfaStage
              data={data}
              step={data.nfaSteps.length - 1}
              playing={false}
              onStepChange={() => undefined}
              onPlayingChange={() => undefined}
              trace={trace.nfa}
              traceStep={traceStep}
            />
            <DfaStage
              data={data}
              step={data.dfaSteps.length - 1}
              playing={false}
              onStepChange={() => undefined}
              onPlayingChange={() => undefined}
              trace={trace.dfa}
              traceStep={traceStep}
            />
            <MinStage
              data={data}
              step={data.hopSteps.length - 1}
              playing={false}
              onStepChange={() => undefined}
              onPlayingChange={() => undefined}
              trace={trace.min}
              traceStep={traceStep}
            />
          </div>
        </>
      )}
    </section>
  );
}

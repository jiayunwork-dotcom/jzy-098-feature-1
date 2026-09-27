/**
 * TestPanel：在三台自动机上跑同一个测试串。
 * 一次请求拿回 NFA / DFA / 最小化 DFA 三条轨迹与 agreement 结论；
 * 顶部用一条共享的字符步进条同步回放，三台机器各自高亮自己的路径。
 */

import { useEffect, useState } from 'react';
import type { SimulateResultDTO } from '../lib/types';
import { StepControls } from './StepControls';

interface TestPanelProps {
  input: string;
  onInputChange: (v: string) => void;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  result: SimulateResultDTO | null;
  traceStep: number;
  onTraceStepChange: (n: number) => void;
  disabled?: boolean;
}

export function TestPanel({
  input,
  onInputChange,
  onRun,
  loading,
  error,
  result,
  traceStep,
  onTraceStepChange,
  disabled,
}: TestPanelProps) {
  const [playing, setPlaying] = useState(false);

  // 换测试结果时自动停在末尾，展示完整路径与最终结论
  useEffect(() => {
    if (result) onTraceStepChange(input ? [...input].length : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const chars = [...input];

  return (
    <section className={`test-panel ${disabled ? 'test-disabled' : ''}`}>
      <h2>测试串：在三台机器上各跑一遍</h2>
      <p className="panel-hint">
        同一条正则、同一个串，NFA、DFA、最小化 DFA 的接受结论必须完全一致——这是本工具的正确性主线。
      </p>

      <div className="test-input-row">
        <input
          className="test-input"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRun();
          }}
          placeholder="输入测试串，例如 ababb"
          spellCheck={false}
          disabled={disabled}
        />
        <button type="button" className="btn btn-primary" onClick={onRun} disabled={loading || disabled}>
          {loading ? '模拟中…' : '运行测试'}
        </button>
      </div>

      {error && (
        <div className="error-box" role="alert">
          <div className="error-message">{error}</div>
        </div>
      )}

      {result && (
        <div className="test-result-block">
          <div
            className={`verdict-banner ${result.agreement ? (result.nfa.accepted ? 'verdict-accept' : 'verdict-reject') : 'verdict-conflict'}`}
          >
            {result.agreement ? (
              result.nfa.accepted ? (
                <>✔ 三台机器一致<strong>接受</strong>该测试串</>
              ) : (
                <>✘ 三台机器一致<strong>拒绝</strong>该测试串</>
              )
            ) : (
              <>⚠ 三台机器结论不一致！这是不应该发生的，请反馈该正则与测试串</>
            )}
          </div>

          <div className="verdict-grid">
            <VerdictCell name="NFA" accepted={result.nfa.accepted} />
            <VerdictCell name="DFA" accepted={result.dfa.accepted} />
            <VerdictCell name="最小化 DFA" accepted={result.min.accepted} />
          </div>

          {chars.length > 0 && (
            <>
              <div className="char-strip" aria-label="逐字符回放">
                <span className={`char-chip ${traceStep === 0 ? 'chip-current' : ''}`}>
                  起点
                </span>
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
                onChange={onTraceStepChange}
                playing={playing}
                onPlayingChange={setPlaying}
                speedMs={700}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function VerdictCell({ name, accepted }: { name: string; accepted: boolean }) {
  return (
    <div className={`verdict-cell ${accepted ? 'cell-accept' : 'cell-reject'}`}>
      <span className="verdict-name">{name}</span>
      <span className="verdict-value">{accepted ? '接受 ✔' : '拒绝 ✘'}</span>
    </div>
  );
}

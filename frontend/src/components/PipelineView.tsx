/**
 * PipelineView：原有三段演示页（Thompson / 子集构造 / Hopcroft + 三机测试串回放）。
 * 从 App.tsx 原样抽出，行为与内置示例保持不变，只是外面多了一层页面切换。
 */

import { useCallback, useEffect, useState } from 'react';
import { constructRegex, fetchExamples, simulateRegex } from '../lib/api';
import type {
  ConstructResultDTO,
  ExampleRegexDTO,
  SimulateResultDTO,
} from '../lib/types';
import { RegexInput } from './RegexInput';
import { NfaStage } from './NfaStage';
import { DfaStage } from './DfaStage';
import { MinStage } from './MinStage';
import { TestPanel } from './TestPanel';

export function PipelineView() {
  const [examples, setExamples] = useState<ExampleRegexDTO[]>([]);
  const [regex, setRegex] = useState('(a|b)*abb');
  const [data, setData] = useState<ConstructResultDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [constructError, setConstructError] = useState<string | null>(null);
  const [errorPosition, setErrorPosition] = useState<number | undefined>(undefined);

  // 三个阶段各自的步进位置
  const [nfaStep, setNfaStep] = useState(0);
  const [dfaStep, setDfaStep] = useState(0);
  const [hopStep, setHopStep] = useState(0);
  const [playing, setPlaying] = useState<{ nfa?: boolean; dfa?: boolean; hop?: boolean }>({});

  // 测试串
  const [testInput, setTestInput] = useState('ababb');
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [trace, setTrace] = useState<SimulateResultDTO | null>(null);
  const [traceStep, setTraceStep] = useState(0);

  useEffect(() => {
    fetchExamples()
      .then(setExamples)
      .catch(() => setExamples([]));
  }, []);

  const handleConstruct = useCallback(
    async (expr?: string) => {
      const target = expr ?? regex;
      setLoading(true);
      setConstructError(null);
      setErrorPosition(undefined);
      setTrace(null);
      try {
        const result = await constructRegex(target);
        setData(result);
        // 初始每段停在第一步，方便老师从头讲；一键跑完由控制条提供
        setNfaStep(0);
        setDfaStep(0);
        setHopStep(0);
        setPlaying({});
      } catch (e) {
        const err = e as Error & { position?: number };
        setConstructError(err.message);
        setErrorPosition(err.position);
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [regex],
  );

  // 首次进入自动构造默认正则
  useEffect(() => {
    void handleConstruct('(a|b)*abb');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePickExample = (ex: ExampleRegexDTO) => {
    setRegex(ex.regex);
    setTestInput(ex.testAccept);
    setTrace(null);
    setTestError(null);
    void handleConstruct(ex.regex);
  };

  const handleRunTest = async () => {
    if (!data) return;
    setTestLoading(true);
    setTestError(null);
    try {
      const result = await simulateRegex(data.regex, testInput);
      setTrace(result);
      setTraceStep([...testInput].length);
    } catch (e) {
      setTestError((e as Error).message);
      setTrace(null);
    } finally {
      setTestLoading(false);
    }
  };

  // 测试回放时，三个阶段都展示"完整机器"（停在最后一帧），路径才完整
  const effectiveDfaStep = trace ? data!.dfaSteps.length - 1 : dfaStep;
  const effectiveHopStep = trace ? data!.hopSteps.length - 1 : hopStep;

  return (
    <div className="app-body">
      <RegexInput
        value={regex}
        onChange={(v) => {
          setRegex(v);
          setConstructError(null);
        }}
        onConstruct={() => handleConstruct()}
        loading={loading}
        error={constructError}
        errorPosition={errorPosition}
        examples={examples}
        onPickExample={handlePickExample}
      />

      <main className="canvas-area">
        {!data && !loading && (
          <div className="empty-state">输入一条正则并点击「构造」开始演示。</div>
        )}
        {loading && <div className="empty-state">正在构造三台自动机…</div>}

        {data && (
          <>
            <TestPanel
              input={testInput}
              onInputChange={setTestInput}
              onRun={handleRunTest}
              loading={testLoading}
              error={testError}
              result={trace}
              traceStep={traceStep}
              onTraceStepChange={setTraceStep}
            />

            <NfaStage
              data={data}
              step={nfaStep}
              playing={!!playing.nfa}
              onStepChange={setNfaStep}
              onPlayingChange={(p) => setPlaying((s) => ({ ...s, nfa: p }))}
              trace={trace?.nfa ?? null}
              traceStep={traceStep}
            />

            <DfaStage
              data={data}
              step={effectiveDfaStep}
              playing={!!playing.dfa}
              onStepChange={setDfaStep}
              onPlayingChange={(p) => setPlaying((s) => ({ ...s, dfa: p }))}
              trace={trace?.dfa ?? null}
              traceStep={traceStep}
            />

            <MinStage
              data={data}
              step={effectiveHopStep}
              playing={!!playing.hop}
              onStepChange={setHopStep}
              onPlayingChange={(p) => setPlaying((s) => ({ ...s, hop: p }))}
              trace={trace?.min ?? null}
              traceStep={traceStep}
            />
          </>
        )}
      </main>
    </div>
  );
}

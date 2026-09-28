/**
 * CompareView：答案对拍页。
 *
 * 两个子模式：
 *  - 单条对拍：左填标准答案、右填学生答案，出四种结论之一、各方向 shortlex
 *    最短反例，并把两台机器同步运行形成的组合状态图一步步演出来；
 *  - 批量判定：一条标准答案 + 最多 30 条学生答案（每行一条），按提交顺序
 *    逐条返回；某条语法错只在那一条上给出原因与位置。
 *
 * 反例旁边的「送到三机回放」按钮把该串填进回放区：左右各一个面板，
 * 各自在自己的 NFA / DFA / 最小化 DFA 上走同一条串。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { compareBatch as apiCompareBatch, compareRegexes } from '../lib/api';
import type {
  BatchCompareResultDTO,
  CompareRelationDTO,
  CompareResultDTO,
  CounterexampleDTO,
  ProductStepDTO,
  Symbol,
} from '../lib/types';
import { StepControls } from './StepControls';
import { ProductGraph } from './ProductGraph';
import { AutomatonGraph } from './AutomatonGraph';
import { CompareReplayPanel } from './CompareReplayPanel';
import { MAX_BATCH_STUDENTS } from './compareConstants';

type Mode = 'single' | 'batch';

const RELATION_TEXT: Record<CompareRelationDTO, string> = {
  equivalent: '两边等价',
  left_subset_right: '左边的语言真包含于右边',
  right_subset_left: '右边的语言真包含于左边',
  incomparable: '互不包含',
};

const RELATION_DETAIL: Record<CompareRelationDTO, string> = {
  equivalent: 'L(左) = L(右)：任意串两台上结论都相同。',
  left_subset_right: 'L(左) ⊊ L(右)：左边接受的串右边都接受，右边还多接受一些。',
  right_subset_left: 'L(右) ⊊ L(左)：右边接受的串左边都接受，左边还多接受一些。',
  incomparable: '两个方向的差集都非空：各有一串只被自己接受。',
};

const CLASS_STYLE: Record<string, { dot: string; text: string }> = {
  both: { dot: '#2f9e44', text: '两边都接受' },
  'left-only': { dot: '#1971c2', text: '只有左边接受' },
  'right-only': { dot: '#e8590c', text: '只有右边接受' },
  neither: { dot: '#adb5bd', text: '两边都不接受' },
};

export function CompareView() {
  const [mode, setMode] = useState<Mode>('single');

  return (
    <div className="compare-view">
      <div className="mode-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'single'}
          className={`mode-tab ${mode === 'single' ? 'tab-active' : ''}`}
          onClick={() => setMode('single')}
        >
          单条对拍
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'batch'}
          className={`mode-tab ${mode === 'batch' ? 'tab-active' : ''}`}
          onClick={() => setMode('batch')}
        >
          批量判定（最多 {MAX_BATCH_STUDENTS} 条）
        </button>
      </div>

      {/* 条件渲染：从批量页"看对拍过程"跳来时，单条组件带着目标值首次挂载，
          不会先用默认演示对闪一帧 */}
      {mode === 'single' ? (
        <SingleCompare />
      ) : (
        <BatchCompare
          onPick={(l, r) => {
            setMode('single');
            // 通过自定义事件把批量行里的对拍请求带到单条模式
            window.dispatchEvent(new CustomEvent('compare:pick', { detail: { left: l, right: r } }));
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 单条对拍
// ---------------------------------------------------------------------------

interface ReplayRequest {
  witness: string;
  /** 该串在左边机器上的应有结论 */
  leftAccepts: boolean;
  /** 该串在右边机器上的应有结论 */
  rightAccepts: boolean;
  /** 来自哪个方向（用于标题） */
  direction: 'leftOnly' | 'rightOnly';
  nonce: number;
}

function SingleCompare() {
  const [left, setLeft] = useState('(a|b)*abb');
  const [right, setRight] = useState('(a|b)*bb');
  const [errorSide, setErrorSide] = useState<'left' | 'right' | null>(null);
  const [errorPos, setErrorPos] = useState<number | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResultDTO | null>(null);

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [replay, setReplay] = useState<ReplayRequest | null>(null);

  const run = useCallback(async (l: string, r: string) => {
    setLoading(true);
    setErrorMsg(null);
    setErrorSide(null);
    setErrorPos(undefined);
    setReplay(null);
    try {
      const res = await compareRegexes(l, r);
      setResult(res);
      setStep(0);
      setPlaying(false);
    } catch (e) {
      const err = e as Error & { position?: number; side?: 'left' | 'right' };
      setErrorMsg(err.message);
      setErrorSide(err.side ?? null);
      setErrorPos(err.position);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 批量页跳过来的对拍
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ left: string; right: string }>).detail;
      setLeft(detail.left);
      setRight(detail.right);
      void run(detail.left, detail.right);
    };
    window.addEventListener('compare:pick', handler);
    return () => window.removeEventListener('compare:pick', handler);
  }, [run]);

  // 首次进入自动跑助教演示用的一对
  useEffect(() => {
    void run('(a|b)*abb', '(a|b)*bb');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentStep: ProductStepDTO | null = result ? result.steps[step] : null;

  // 逐步帧只增量记录新边：从最终转移表按 newTransition 下标切出截至本帧的累积视图
  const frameEdgeCount = useMemo(() => {
    if (!result || !currentStep) return 0;
    let max = -1;
    for (let i = 0; i <= step; i++) {
      if (result.steps[i].newTransition > max) max = result.steps[i].newTransition;
    }
    return max + 1;
  }, [result, currentStep, step]);

  const visibleStateIds = useMemo(() => {
    if (!result || !currentStep) return [];
    return result.product.states.slice(0, currentStep.stateCount).map((s) => s.id);
  }, [result, currentStep]);

  const frameTransitions = useMemo(() => {
    if (!result) return [];
    return result.product.transitions.slice(0, frameEdgeCount);
  }, [result, frameEdgeCount]);

  // 反例回放时在乘积图上叠加路径
  const productPath = useMemo(() => {
    if (!result || !replay) return null;
    return traceProductPath(result, replay.witness);
  }, [result, replay]);

  const sendReplay = (ce: CounterexampleDTO, direction: 'leftOnly' | 'rightOnly') => {
    if (!ce.exists || ce.witness === null || !result) return;
    setReplay({
      witness: ce.witness,
      leftAccepts: direction === 'leftOnly',
      rightAccepts: direction === 'rightOnly',
      direction,
      nonce: Date.now(),
    });
  };

  return (
    <div className="single-compare">
      <div className="compare-input-grid">
        <CompareRegexBox
          title="标准答案（左）"
          value={left}
          invalid={errorSide === 'left'}
          errorPos={errorSide === 'left' ? errorPos : undefined}
          onChange={(v) => {
            setLeft(v);
            if (errorSide === 'left') setErrorMsg(null);
          }}
          onSubmit={() => void run(left, right)}
        />
        <div className="compare-vs" aria-hidden>
          <span>对拍</span>
        </div>
        <CompareRegexBox
          title="学生答案（右）"
          value={right}
          invalid={errorSide === 'right'}
          errorPos={errorSide === 'right' ? errorPos : undefined}
          onChange={(v) => {
            setRight(v);
            if (errorSide === 'right') setErrorMsg(null);
          }}
          onSubmit={() => void run(left, right)}
        />
      </div>

      <div className="compare-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void run(left, right)}
          disabled={loading || !left.trim() || !right.trim()}
        >
          {loading ? '判定中…' : '开始对拍'}
        </button>
        {errorMsg && (
          <div className="error-box compare-error" role="alert">
            <div className="error-title">
              {errorSide === 'left' ? '左边正则有误' : errorSide === 'right' ? '右边正则有误' : '对拍失败'}
            </div>
            <div className="error-message">{errorMsg}</div>
          </div>
        )}
      </div>

      {result && (
        <>
          <section className="stage-card verdict-card">
            <div className={`verdict-ribbon relation-${result.relation}`}>
              <span className="verdict-relation">{RELATION_TEXT[result.relation]}</span>
              <span className="verdict-detail">{RELATION_DETAIL[result.relation]}</span>
            </div>
            <div className="counterexample-grid">
              <CounterexampleCard
                title="只属于左边（左接受 · 右拒绝）"
                ce={result.leftOnly}
                accent="left"
                onReplay={() => sendReplay(result.leftOnly, 'leftOnly')}
                replayActive={replay?.direction === 'leftOnly'}
              />
              <CounterexampleCard
                title="只属于右边（右接受 · 左拒绝）"
                ce={result.rightOnly}
                accent="right"
                onReplay={() => sendReplay(result.rightOnly, 'rightOnly')}
                replayActive={replay?.direction === 'rightOnly'}
              />
            </div>
            <p className="alphabet-line">
              判定字母表（两边并集，按码点排序）：
              {result.alphabet.length
                ? result.alphabet.map((s) => <code key={s} className="alpha-chip">{formatSym(s)}</code>)
                : <em>∅（两边都只用了 ε/空分组）</em>}
            </p>
          </section>

          <section className="stage-card">
            <header className="stage-head">
              <h2>组合状态图：两台机器同步运行</h2>
              <p className="stage-subtitle">
                每个组合状态标明左右分量（M = 最小化 DFA 状态，† = 显式补出的死状态）；
                颜色区分四类接受性。BFS 按码点序展开，每个状态第一次被发现时的到达串就是 shortlex 最小串。
              </p>
            </header>

            <StepControls
              current={step}
              total={result.steps.length}
              onChange={setStep}
              playing={playing}
              onPlayingChange={setPlaying}
              speedMs={650}
            />
            {replay && (
              <p className="replay-hint">
                正在回放反例串，下图为完整组合状态图、蓝色路径即两台机器的同步轨迹；
                关闭下方回放区即可继续逐步展开。
              </p>
            )}

            {currentStep && (
              <div className="step-explanation">
                <strong>{currentStep.title}</strong>
                <p>{currentStep.description}</p>
              </div>
            )}

            <ProductGraph
              states={result.product.states}
              transitions={replay ? result.product.transitions : frameTransitions}
              start={result.product.start}
              leftDead={result.left.deadState}
              rightDead={result.right.deadState}
              visibleStates={replay ? undefined : visibleStateIds}
              currentState={replay ? null : currentStep?.currentState ?? null}
              newState={replay ? null : currentStep?.newState ?? null}
              frontier={replay ? [] : currentStep?.frontier ?? []}
              activeEdge={
                !replay && currentStep && currentStep.targetState !== null
                  ? { from: currentStep.currentState!, to: currentStep.targetState }
                  : null
              }
              pathStates={productPath?.states ?? []}
              pathEdges={productPath?.edges ?? []}
            />

            <div className="stage-legend product-legend">
              {(['both', 'left-only', 'right-only', 'neither'] as const).map((cls) => (
                <span key={cls}>
                  <i className="product-class-dot" style={{ background: CLASS_STYLE[cls].dot }} />
                  {CLASS_STYLE[cls].text}
                </span>
              ))}
              <span><i className="legend-queue-swatch" /> 待处理队列</span>
              <span className="legend-active">橙色描边 = 当前正在展开</span>
              {replay && <span className="legend-info">蓝线 = 反例串在乘积图上的同步路径</span>}
            </div>
          </section>

          <section className="stage-card">
            <header className="stage-head">
              <h2>两侧补全死状态后的最小化 DFA</h2>
              <p className="stage-subtitle">
                三段演示里没有转移的符号隐式落入死状态（约定不变）；对拍把死状态显式补出来参与计算，
                下图中灰色虚线的 † 状态就是它——读到对方字母表里的符号时，机器在这里分岔。
              </p>
            </header>
            <div className="completed-dfa-grid">
              <CompletedDfa side={result.left} title="左边（标准答案）" />
              <CompletedDfa side={result.right} title="右边（学生答案）" />
            </div>
          </section>

          {replay && (
            <section className="stage-card">
              <header className="stage-head replay-section-head">
                <div>
                  <h2>
                    三机回放：同一条反例串{' '}
                    <code>{replay.witness === '' ? 'ε（空串）' : replay.witness}</code>
                  </h2>
                  <p className="stage-subtitle">
                    拖动字符条逐步看：一边的三台机器一致接受，另一边的三台机器一致拒绝。
                  </p>
                </div>
                <button type="button" className="btn btn-small" onClick={() => setReplay(null)}>
                  关闭回放
                </button>
              </header>
              <div className="replay-grid">
                <CompareReplayPanel
                  key={`L-${replay.nonce}`}
                  side={result.left}
                  accepts={replay.leftAccepts}
                  witness={replay.witness}
                />
                <CompareReplayPanel
                  key={`R-${replay.nonce}`}
                  side={result.right}
                  accepts={replay.rightAccepts}
                  witness={replay.witness}
                />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function CompareRegexBox(props: {
  title: string;
  value: string;
  invalid: boolean;
  errorPos?: number;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className={`compare-regex-box ${props.invalid ? 'box-invalid' : ''}`}>
      <label className="compare-box-title">{props.title}</label>
      <textarea
        className="regex-textarea compare-textarea"
        rows={2}
        value={props.value}
        spellCheck={false}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') props.onSubmit();
        }}
      />
      {props.invalid && props.errorPos !== undefined && props.errorPos < props.value.length && (
        <pre className="error-pointer">
          {`${props.value}\n${' '.repeat(props.errorPos)}^ 位置 ${props.errorPos}`}
        </pre>
      )}
    </div>
  );
}

function CounterexampleCard(props: {
  title: string;
  ce: CounterexampleDTO;
  accent: 'left' | 'right';
  onReplay: () => void;
  replayActive: boolean;
}) {
  const { ce } = props;
  return (
    <div className={`counterexample-card ce-${props.accent} ${props.replayActive ? 'ce-active' : ''}`}>
      <div className="ce-title">{props.title}</div>
      {ce.exists ? (
        <>
          <div className="ce-witness">
            {ce.witness === '' ? (
              <>
                <span className="ce-epsilon">ε</span>
                <span className="ce-note">反例就是空串（长度 0）</span>
              </>
            ) : (
              <>
                <code className="ce-string">{ce.witness}</code>
                <span className="ce-note">长度 {ce.length}</span>
              </>
            )}
          </div>
          <button type="button" className="btn btn-small btn-primary" onClick={props.onReplay}>
            送到三机回放 ▶
          </button>
        </>
      ) : (
        <div className="ce-empty">
          <span className="ce-none">该方向差集为空</span>
          <span className="ce-note">没有反例（这个方向上所有串结论一致）</span>
        </div>
      )}
    </div>
  );
}

function CompletedDfa({ side, title }: { side: CompareResultDTO['left']; title: string }) {
  return (
    <div className="completed-dfa-col">
      <h3 className="col-title">
        {title} <code className="side-regex">{side.regex}</code>
      </h3>
      <AutomatonGraph
        states={side.dfa.states}
        accepting={side.dfa.accepting}
        start={side.dfa.start}
        edges={side.dfa.transitions.map((t) => ({ from: t.from, to: t.to, labels: [t.symbol] }))}
        statePrefix="M"
        dimmedStates={[side.deadState]}
      />
      <p className="graph-hint">
        灰色虚线状态 †M{side.deadState} 是显式死状态；该侧自己的字母表为{' '}
        {side.ownAlphabet.length
          ? side.ownAlphabet.map((s) => formatSym(s)).join('、')
          : '∅'}
        ，其余并集符号都会引向它。
      </p>
    </div>
  );
}

/** 在乘积图上沿见证串走出一条路径（状态序列 + 边 key 序列） */
function traceProductPath(result: CompareResultDTO, witness: string): {
  states: number[];
  edges: string[];
} {
  const move = new Map<string, number>();
  for (const t of result.product.transitions) move.set(`${t.from}:${t.symbol}`, t.to);
  const states = [result.product.start];
  const edges: string[] = [];
  let cur = result.product.start;
  for (const ch of [...witness]) {
    const next = move.get(`${cur}:${ch}`);
    if (next === undefined) break;
    edges.push(`${cur}->${next}`);
    states.push(next);
    cur = next;
  }
  return { states, edges };
}

function formatSym(s: Symbol): string {
  if (s === '\n') return '\\n';
  if (s === '\t') return '\\t';
  if (s === ' ') return '␣';
  return s;
}

// ---------------------------------------------------------------------------
// 批量判定
// ---------------------------------------------------------------------------

function BatchCompare({ onPick }: { onPick: (left: string, right: string) => void }) {
  const [reference, setReference] = useState('(a|b)*');
  const [studentsText, setStudentsText] = useState('(a*b*)*\na(ba)*\n(a|b)*abb\n(a\na?b?c?');
  const [loading, setLoading] = useState(false);
  const [refError, setRefError] = useState<{ msg: string; pos?: number } | null>(null);
  const [result, setResult] = useState<BatchCompareResultDTO | null>(null);

  const lines = useMemo(
    () => studentsText.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === '')),
    [studentsText],
  );
  const overLimit = lines.length > MAX_BATCH_STUDENTS;

  const run = async () => {
    setLoading(true);
    setRefError(null);
    setResult(null);
    try {
      const res = await apiCompareBatch(reference, lines);
      setResult(res);
    } catch (e) {
      const err = e as Error & { position?: number };
      setRefError({ msg: err.message, pos: err.position });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="batch-compare">
      <div className="batch-input-block">
        <label className="compare-box-title">标准答案（所有学生答案都与它对拍）</label>
        <textarea
          className={`regex-textarea compare-textarea ${refError ? 'box-invalid-textarea' : ''}`}
          rows={2}
          value={reference}
          spellCheck={false}
          onChange={(e) => {
            setReference(e.target.value);
            setRefError(null);
          }}
        />
        {refError && (
          <div className="error-box" role="alert">
            <div className="error-title">标准答案有误，整批未执行</div>
            <div className="error-message">{refError.msg}</div>
            {refError.pos !== undefined && refError.pos < reference.length && (
              <pre className="error-pointer">
                {`${reference}\n${' '.repeat(refError.pos)}^ 位置 ${refError.pos}`}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="batch-input-block">
        <label className="compare-box-title">
          学生答案（每行一条，按行号作为提交顺序；当前 {lines.length} 条）
        </label>
        <textarea
          className="regex-textarea batch-textarea"
          rows={9}
          value={studentsText}
          spellCheck={false}
          onChange={(e) => setStudentsText(e.target.value)}
          placeholder={'每行一条学生正则，例如：\n(a*b*)*\na(ba)*'}
        />
        {overLimit && (
          <div className="error-box" role="alert">
            <div className="error-message">
              超过上限：最多 {MAX_BATCH_STUDENTS} 条，当前 {lines.length} 条，提交将被整体拒绝。
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void run()}
        disabled={loading || !reference.trim() || lines.length === 0 || overLimit}
      >
        {loading ? '批量判定中…' : `批量判定（${lines.length} 条）`}
      </button>

      {result && (
        <div className="batch-results">
          <h3 className="col-title">判定结果（按提交顺序）</h3>
          <table className="batch-table">
            <thead>
              <tr>
                <th className="col-idx">#</th>
                <th className="col-regex">学生答案</th>
                <th className="col-relation">结论</th>
                <th className="col-witness">反例</th>
                <th className="col-action"></th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((item) => (
                <tr key={item.index} className={item.ok ? '' : 'row-error'}>
                  <td className="col-idx">{item.index + 1}</td>
                  <td className="col-regex">
                    <code>{item.student === '' ? <em>（空行）</em> : item.student}</code>
                  </td>
                  <td className="col-relation">
                    {item.ok ? (
                      <span className={`relation-tag relation-${item.relation}`}>
                        {RELATION_TEXT[item.relation!]}
                      </span>
                    ) : (
                      <span className="relation-tag tag-error">
                        语法/规模错误
                        {item.error!.position !== undefined && (
                          <em className="error-pos">（第 {item.error!.position} 列）</em>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="col-witness">
                    {item.ok ? (
                      <BatchWitness item={item} />
                    ) : (
                      <span className="batch-error-msg">{item.error!.error}</span>
                    )}
                  </td>
                  <td className="col-action">
                    {item.ok && (
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => onPick(result.reference, item.student)}
                      >
                        看对拍过程
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BatchWitness({ item }: { item: BatchCompareResultDTO['results'][number] }) {
  const parts: string[] = [];
  if (item.leftOnly?.exists) {
    parts.push(`仅左：${item.leftOnly.witness === '' ? 'ε 空串' : item.leftOnly.witness}`);
  }
  if (item.rightOnly?.exists) {
    parts.push(`仅右：${item.rightOnly.witness === '' ? 'ε 空串' : item.rightOnly.witness}`);
  }
  if (item.relation === 'equivalent') return <span className="ce-none">—（等价，无反例）</span>;
  return <span className="batch-witness-text">{parts.join('；')}</span>;
}

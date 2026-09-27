/**
 * CompareView：答案对拍页面。
 *
 * 上半：单条对拍——左边标准答案、右边学生答案，一次请求拿回
 *   - 四种语言关系结论（等价 / 左真包含于右 / 右真包含于左 / 互不包含）
 *   - 每个非空差集方向"最短且最靠前"的反例（null 与 "" 严格区分）
 *   - 两台补全了显式死状态的机器 + 同步运行的组合状态图 + 逐步数据
 * 反例旁的「在三台机器上回放」按钮并行取回两边 construct，再各跑一次 simulate，
 * 在左右各自的 NFA/DFA/最小化 DFA 上亲眼看到一边接受、一边拒绝。
 *
 * 下半：批量对拍——一条标准答案配最多 30 条学生答案（每行一条），
 * 逐条返回结论；某条语法错误只在该条上带错误原因/位置/侧别。
 */

import { useCallback, useState } from 'react';
import { compareBatchApi, compareRegexesApi, constructRegex } from '../lib/api';
import type {
  CompareBatchItemDTO,
  CompareResultDTO,
  CompareRelationDTO,
  ConstructResultDTO,
} from '../lib/types';
import { ProductGraph, ProductLegend } from './ProductGraph';
import { StepControls } from './StepControls';
import { SideReplay } from './SideReplay';

const RELATION_TEXT: Record<CompareRelationDTO, { text: string; cls: string }> = {
  equal: { text: '两边等价：两个语言完全相同', cls: 'verdict-accept' },
  left_subset: {
    text: '左边的语言真包含于右边：左边接受的串右边都接受，右边还多接受一些',
    cls: 'verdict-left',
  },
  right_subset: {
    text: '右边的语言真包含于左边：右边接受的串左边都接受，左边还多接受一些',
    cls: 'verdict-right',
  },
  incomparable: { text: '互不包含：两边各接受一些对方不接受的串', cls: 'verdict-conflict' },
};

const ITEM_RELATION_TEXT: Record<CompareRelationDTO, string> = {
  equal: '等价',
  left_subset: '标准答案 ⊃ 学生答案',
  right_subset: '学生答案 ⊃ 标准答案',
  incomparable: '互不包含',
};

function displayInput(s: string): string {
  if (s === '') return 'ε（空串）';
  return s === ' ' ? '␣' : s;
}

interface ReplayBundle {
  input: string;
  direction: 'leftOnly' | 'rightOnly';
  left: ConstructResultDTO;
  right: ConstructResultDTO;
}

export function CompareView() {
  const [left, setLeft] = useState('(a|b)*abb');
  const [right, setRight] = useState('(a|b)*bb');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResultDTO | null>(null);
  const [error, setError] = useState<{ message: string; side?: 'left' | 'right'; position?: number } | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [replay, setReplay] = useState<ReplayBundle | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  const [batchLeft, setBatchLeft] = useState('(a|b)*');
  const [batchAnswersText, setBatchAnswersText] = useState('(a*b*)*\na(ba)*\na*\n(a|\n');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResults, setBatchResults] = useState<CompareBatchItemDTO[] | null>(null);
  /** 本次批量提交时解析出的原始答案（按行），结果里的 index 直接索引它 */
  const [batchAnswers, setBatchAnswers] = useState<string[]>([]);

  const runCompare = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setReplay(null);
    try {
      const r = await compareRegexesApi(left, right);
      setResult(r);
      setStep(0);
      setPlaying(false);
    } catch (e) {
      const err = e as Error & { side?: 'left' | 'right'; position?: number };
      setError({ message: err.message, side: err.side, position: err.position });
    } finally {
      setLoading(false);
    }
  }, [left, right]);

  const replayWitness = async (input: string, direction: 'leftOnly' | 'rightOnly') => {
    if (!result) return;
    setReplayLoading(true);
    setReplayError(null);
    setReplay(null);
    try {
      const [leftData, rightData] = await Promise.all([
        constructRegex(result.leftRegex),
        constructRegex(result.rightRegex),
      ]);
      setReplay({ input, direction, left: leftData, right: rightData });
      setStep(result.steps.length - 1);
    } catch (e) {
      setReplayError((e as Error).message);
    } finally {
      setReplayLoading(false);
    }
  };

  const leftOnlyStateId =
    result && result.leftOnlyWitness !== null && result.leftOnlyWitness !== undefined
      ? findStateByWitness(result, result.leftOnlyWitness)
      : null;
  const rightOnlyStateId =
    result && result.rightOnlyWitness !== null && result.rightOnlyWitness !== undefined
      ? findStateByWitness(result, result.rightOnlyWitness)
      : null;

  const runBatch = async () => {
    const answers = batchAnswersText.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
    setBatchLoading(true);
    setBatchError(null);
    setBatchResults(null);
    if (answers.length === 0) {
      setBatchError('至少填写一条学生答案（每行一条）');
      setBatchLoading(false);
      return;
    }
    if (answers.length > 30) {
      setBatchError(`学生答案最多 30 条，当前 ${answers.length} 条，请删减后再提交`);
      setBatchLoading(false);
      return;
    }
    try {
      const r = await compareBatchApi(batchLeft, answers);
      setBatchAnswers(answers);
      setBatchResults(r.results);
    } catch (e) {
      setBatchError((e as Error).message);
    } finally {
      setBatchLoading(false);
    }
  };

  const loadIntoSingle = (answer: string) => {
    setLeft(batchLeft);
    setRight(answer);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cur = result?.steps[Math.min(step, result.steps.length - 1)] ?? null;

  return (
    <div className="cmp-page">
      {/* ---------- 单条对拍 ---------- */}
      <section className="stage-card cmp-single">
        <h2>答案对拍：标准答案 vs 学生答案</h2>
        <p className="panel-hint">
          后端在两边字母表的<strong>并集</strong>上直接判定语言关系，并在两台机器同步运行形成的组合状态图上演到分岔那一步。
          判定字母表缺失的转移在本页会<strong>显式补成死状态</strong>（原三段演示页仍保持隐式死状态约定不变）。
        </p>

        <div className="cmp-input-grid">
          <label className={`cmp-input-cell ${error?.side === 'left' ? 'cmp-input-error' : ''}`}>
            <span className="cmp-input-label">
              <span className="tag tag-new">左 · 标准答案</span>
            </span>
            <textarea
              className="regex-textarea"
              rows={2}
              value={left}
              spellCheck={false}
              onChange={(e) => setLeft(e.target.value)}
            />
          </label>
          <label className={`cmp-input-cell ${error?.side === 'right' ? 'cmp-input-error' : ''}`}>
            <span className="cmp-input-label">
              <span className="tag tag-current">右 · 学生答案</span>
            </span>
            <textarea
              className="regex-textarea"
              rows={2}
              value={right}
              spellCheck={false}
              onChange={(e) => setRight(e.target.value)}
            />
          </label>
        </div>

        {error && (
          <div className="error-box cmp-error-box" role="alert">
            <div className="error-title">
              {error.side === 'left' ? '左边（标准答案）正则有误' : error.side === 'right' ? '右边（学生答案）正则有误' : '无法对拍'}
            </div>
            <div className="error-message">{error.message}</div>
            {error.position !== undefined && (
              <div className="error-message cmp-error-pos">出错位置：第 {error.position} 列（0 基），对应输入框已标红</div>
            )}
          </div>
        )}

        <div className="cmp-run-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={runCompare}
            disabled={loading}
          >
            {loading ? '判定中…' : '开始对拍'}
          </button>
          {result && (
            <span className="cmp-alphabet">
              判定字母表（并集）：
              {result.alphabet.map((s) => (
                <code key={s} className="cmp-alpha-chip">{s === ' ' ? '␣' : s}</code>
              ))}
            </span>
          )}
        </div>

        {result && (
          <>
            <div className={`verdict-banner ${RELATION_TEXT[result.relation].cls}`}>
              {RELATION_TEXT[result.relation].text}
            </div>

            <div className="cmp-witness-grid">
              <WitnessCard
                title="只属于左边（左接受 · 右拒绝）"
                witness={result.leftOnlyWitness}
                tone="left"
                onReplay={() => replayWitness(result.leftOnlyWitness!, 'leftOnly')}
                replayDisabled={replayLoading}
              />
              <WitnessCard
                title="只属于右边（右接受 · 左拒绝）"
                witness={result.rightOnlyWitness}
                tone="right"
                onReplay={() => replayWitness(result.rightOnlyWitness!, 'rightOnly')}
                replayDisabled={replayLoading}
              />
            </div>
            {replayLoading && <p className="panel-hint">正在取回两边的三台机器并回放反例…</p>}
            {replayError && (
              <div className="error-box" role="alert">
                <div className="error-message">回放失败：{replayError}</div>
              </div>
            )}

            {replay && result && (
              <div className="cmp-replay-grid">
                <SideReplay
                  title={`左 · 标准答案：${displayInput(replay.input)}`}
                  data={replay.left}
                  input={replay.input}
                  accepted={replay.direction === 'leftOnly'}
                />
                <SideReplay
                  title={`右 · 学生答案：${displayInput(replay.input)}`}
                  data={replay.right}
                  input={replay.input}
                  accepted={replay.direction === 'rightOnly'}
                />
              </div>
            )}

            <h3 className="cmp-subhead">组合状态图：两台机器同步展开</h3>
            <StepControls
              current={step}
              total={result.steps.length}
              onChange={setStep}
              playing={playing}
              onPlayingChange={setPlaying}
              speedMs={750}
            />
            <div className="step-explanation">
              <strong>{cur!.title}</strong>
              <p>{cur!.description}</p>
            </div>
            <ProductGraph
              states={cur!.states}
              start={result.product.start}
              transitions={cur!.transitions}
              currentState={cur!.currentState}
              newState={cur!.newState}
              frontier={cur!.frontier}
              leftDead={result.leftMachine.deadState}
              rightDead={result.rightMachine.deadState}
              leftOnlyStateId={leftOnlyStateId}
              rightOnlyStateId={rightOnlyStateId}
            />
            <ProductLegend />

            <div className="cmp-machines-note">
              <details>
                <summary>两边各自参与计算的机器（已补全显式死状态）</summary>
                <div className="cmp-machine-list">
                  <MachineSummary name="左 · 标准答案" machine={result.leftMachine} regex={result.leftRegex} />
                  <MachineSummary name="右 · 学生答案" machine={result.rightMachine} regex={result.rightRegex} />
                </div>
              </details>
            </div>
          </>
        )}
      </section>

      {/* ---------- 批量对拍 ---------- */}
      <section className="stage-card cmp-batch">
        <h2>批量判定：一条标准答案 × 最多 30 条学生答案</h2>
        <div className="cmp-batch-inputs">
          <label className="cmp-batch-ref">
            <span className="cmp-input-label">
              <span className="tag tag-new">标准答案</span>
            </span>
            <input
              className="test-input"
              value={batchLeft}
              spellCheck={false}
              onChange={(e) => setBatchLeft(e.target.value)}
            />
          </label>
          <label className="cmp-batch-answers">
            <span className="cmp-input-label">
              <span className="tag tag-current">学生答案（每行一条，至多 30 行）</span>
            </span>
            <textarea
              className="regex-textarea"
              rows={6}
              value={batchAnswersText}
              spellCheck={false}
              onChange={(e) => setBatchAnswersText(e.target.value)}
              placeholder={'(a*b*)*\na(ba)*\na*'}
            />
          </label>
        </div>
        <div className="cmp-run-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={runBatch}
            disabled={batchLoading}
          >
            {batchLoading ? '批量判定中…' : '批量判定'}
          </button>
        </div>
        {batchError && (
          <div className="error-box" role="alert">
            <div className="error-message">{batchError}</div>
          </div>
        )}
        {batchResults && (
          <div className="cmp-batch-table-wrap">
            <table className="subset-table cmp-batch-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>结论</th>
                  <th>只属于标准答案的反例</th>
                  <th>只属于学生答案的反例</th>
                  <th>错误</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {batchResults.map((item) => (
                  <tr key={item.index} className={item.error ? 'cmp-row-error' : ''}>
                    <td className="cell-dfa">{item.index + 1}</td>
                    <td>{item.relation ? ITEM_RELATION_TEXT[item.relation] : '—'}</td>
                    <td>{item.relation ? <WitnessCode witness={item.leftOnlyWitness === undefined ? null : item.leftOnlyWitness} /> : '—'}</td>
                    <td>{item.relation ? <WitnessCode witness={item.rightOnlyWitness === undefined ? null : item.rightOnlyWitness} /> : '—'}</td>
                    <td className="cmp-cell-error">
                      {item.error ? (
                        <>
                          {item.side === 'left' ? '标准答案：' : '学生答案：'}
                          {item.error}
                          {item.position !== undefined && <em>（第 {item.position} 列）</em>}
                        </>
                      ) : (
                        ''
                      )}
                    </td>
                    <td>
                      {item.relation && item.relation !== 'equal' && (
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => loadIntoSingle(batchAnswers[item.index])}
                        >
                          送进单拍 →
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function findStateByWitness(result: CompareResultDTO, witness: string): number | null {
  // 反例串就是到达该组合状态的 witness（BFS 记录）
  const s = result.product.states.find((st) => st.witness === witness);
  return s ? s.id : null;
}

function WitnessCode({ witness }: { witness: string | null }) {
  if (witness === null) return <span className="cmp-no-witness">无</span>;
  return <code className="cmp-witness-code">{displayInput(witness)}</code>;
}

function WitnessCard({
  title,
  witness,
  tone,
  onReplay,
  replayDisabled,
}: {
  title: string;
  witness: string | null;
  tone: 'left' | 'right';
  onReplay: () => void;
  replayDisabled: boolean;
}) {
  return (
    <div className={`cmp-witness-card ${tone === 'left' ? 'cmp-witness-left' : 'cmp-witness-right'}`}>
      <div className="cmp-witness-title">{title}</div>
      {witness === null ? (
        <div className="cmp-witness-none">该方向差集为空（没有反例）</div>
      ) : (
        <div className="cmp-witness-body">
          <code className="cmp-witness-code">{displayInput(witness)}</code>
          <button
            type="button"
            className="btn btn-small btn-primary"
            onClick={onReplay}
            disabled={replayDisabled}
          >
            在三台机器上回放 →
          </button>
        </div>
      )}
    </div>
  );
}

function MachineSummary({
  name,
  machine,
  regex,
}: {
  name: string;
  machine: CompareResultDTO['leftMachine'];
  regex: string;
}) {
  return (
    <div className="cmp-machine-summary">
      <h4>{name} <code>{regex}</code></h4>
      <p className="panel-hint">
        {machine.states.length} 个状态（含显式死状态 D{machine.deadState}），
        每个状态在 {machine.alphabet.map((s) => `"${s}"`).join('、')} 上都有转移。
      </p>
      <ul className="cmp-transition-list">
        {machine.transitions.map((t, i) => (
          <li key={i}>
            <code>
              D{t.from} --{t.symbol}--&gt; D{t.to}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}

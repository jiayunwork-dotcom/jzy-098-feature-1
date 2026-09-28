/**
 * 答案对拍：判定两条正则所描述语言之间的包含关系，并给出确定性的最短反例。
 *
 * 做法：
 *   1. 两条正则各自走完整条流水线，取最小化 DFA（与原 DFA 语言完全相同）；
 *   2. 在两边字母表的**并集**上给两台机器各补一个显式死状态，处处有转移；
 *   3. 构造乘积自动机 (p, q)：两台机器同步读同一个符号、各走各的转移；
 *   4. 从初态做 BFS，按字母表码点序枚举符号——先按长度、同长按码点字典序，
 *      因此每个组合状态第一次被发现时记录的到达串就是 shortlex 最小串，
 *      与调用次数、左右顺序都无关（交换左右只会把组合状态的两列对调）；
 *   5. BFS 同时产出逐步演示数据：正在展开的组合状态、本步新状态、待处理队列。
 *
 * 组合状态按接受性分四类：
 *   both       两边都接受
 *   left-only  只有左边接受 → L(左) \\ L(右) 的元素，即"左反例"
 *   right-only 只有右边接受 → L(右) \\ L(左) 的元素，即"右反例"
 *   neither    两边都不接受
 * 每个非 both 的类别只记录 BFS 中第一个出现的状态，其到达串即该方向
 * 差集里"最短且最靠前"的反例（空串反例对应初态本身）。
 */

import { parseRegex, ParseError } from '../parser/regexParser';
import { buildThompson } from './thompson';
import { buildSubsetDfa } from './subset';
import { minimizeDfa } from './hopcroft';
import type {
  BatchCompareItem,
  BatchCompareResult,
  CompareRelation,
  CompareResult,
  CompareSide,
  Counterexample,
  DFA,
  DfaTransition,
  ProductAcceptClass,
  ProductState,
  ProductStep,
  Symbol,
} from './types';

/** 组合状态数上限：乘积最坏是两侧状态数之积，超限直接报错而不是让请求挂死 */
export const MAX_PRODUCT_STATES = 400;

export class CompareLimitError extends Error {
  code = 'product_limit';
  constructor(count: number) {
    super(
      `组合状态数量超过上限（已生成 ${count} 个，上限 ${MAX_PRODUCT_STATES} 个）：` +
        '两条正则的机器规模过大，对拍无法完成，请换更简单的表达式',
    );
    this.name = 'CompareLimitError';
  }
}

/** 解析/构造一条正则到最小化 DFA（不生成逐步数据，批量对拍时更省） */
export function buildMinDfa(regex: string): {
  min: DFA;
  alphabet: Symbol[];
} {
  const { ast, alphabet } = parseRegex(regex);
  const { nfa } = buildThompson(ast, alphabet);
  const { dfa } = buildSubsetDfa(nfa);
  const { min } = minimizeDfa(dfa);
  return { min, alphabet };
}

/** 按码点升序排列符号（shortlex 序中同长度串逐位比较所依据的顺序） */
export function sortByCodePoint(symbols: Symbol[]): Symbol[] {
  return [...new Set(symbols)].sort((a, b) => {
    const ia = [...a].map((c) => c.codePointAt(0)!);
    const ib = [...b].map((c) => c.codePointAt(0)!);
    for (let i = 0; i < Math.min(ia.length, ib.length); i++) {
      if (ia[i] !== ib[i]) return ia[i] - ib[i];
    }
    return ia.length - ib.length;
  });
}

/**
 * 在给定字母表上把一台 DFA 补成"处处有转移"的完整 DFA：
 * 新增一个非接受的死状态，所有缺失转移都引向它，死状态自环。
 * 老三段演示仍然使用不含死状态的原始 DFA（约定不变），这里只服务于对拍。
 */
export function completeDfa(dfa: DFA, alphabet: Symbol[]): { dfa: DFA; deadState: number } {
  const dead = dfa.states.length;
  const states = [...dfa.states, dead];
  const existing = new Set(dfa.transitions.map((t) => `${t.from}:${t.symbol}`));
  const transitions: DfaTransition[] = [...dfa.transitions];
  for (const s of states) {
    for (const sym of alphabet) {
      if (!existing.has(`${s}:${sym}`)) transitions.push({ from: s, symbol: sym, to: dead });
    }
  }
  transitions.sort((a, b) =>
    a.from !== b.from ? a.from - b.from : a.symbol.localeCompare(b.symbol),
  );
  return {
    dfa: {
      states,
      start: dfa.start,
      accepting: [...dfa.accepting],
      transitions,
      alphabet,
    },
    deadState: dead,
  };
}

function transitionTable(dfa: DFA): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of dfa.transitions) map.set(`${t.from}:${t.symbol}`, t.to);
  return map;
}

function acceptClassOf(
  leftAccept: boolean,
  rightAccept: boolean,
): ProductAcceptClass {
  if (leftAccept && rightAccept) return 'both';
  if (leftAccept) return 'left-only';
  if (rightAccept) return 'right-only';
  return 'neither';
}

function makeCounterexample(state: ProductState | null): Counterexample {
  if (!state) return { exists: false, witness: null, length: 0, productState: null };
  return {
    exists: true,
    witness: state.witness,
    length: [...state.witness].length,
    productState: state.id,
  };
}

/** 单条对拍：两侧正则都已假定是字符串；任何错误直接抛给路由层包装。 */
export function compareRegexes(leftRegex: string, rightRegex: string): CompareResult {
  const leftBuilt = buildMinDfa(leftRegex);
  const rightBuilt = buildMinDfa(rightRegex);

  const alphabet = sortByCodePoint([...leftBuilt.alphabet, ...rightBuilt.alphabet]);

  const leftCompleted = completeDfa(leftBuilt.min, alphabet);
  const rightCompleted = completeDfa(rightBuilt.min, alphabet);

  const left: CompareSide = {
    regex: leftRegex,
    ownAlphabet: sortByCodePoint(leftBuilt.alphabet),
    dfa: leftCompleted.dfa,
    deadState: leftCompleted.deadState,
  };
  const right: CompareSide = {
    regex: rightRegex,
    ownAlphabet: sortByCodePoint(rightBuilt.alphabet),
    dfa: rightCompleted.dfa,
    deadState: rightCompleted.deadState,
  };

  return buildProduct(left, right, alphabet);
}

/**
 * 乘积构造 + BFS。每"取一个状态出队"和"沿一个符号展开"各录一帧，
 * 风格与子集构造演示一致：新状态帧高亮新发现的组合状态，
 * 已存在的目标只连边；frontier 是展开后尚未处理的队列。
 */
function buildProduct(left: CompareSide, right: CompareSide, alphabet: Symbol[]): CompareResult {
  const ltm = transitionTable(left.dfa);
  const rtm = transitionTable(right.dfa);
  const lAccept = new Set(left.dfa.accepting);
  const rAccept = new Set(right.dfa.accepting);

  const states: ProductState[] = [];
  const transitions: DfaTransition[] = [];
  const idOf = new Map<string, number>();
  const stateId = (l: number, r: number) => {
    const found = idOf.get(`${l}:${r}`);
    return found === undefined ? null : found;
  };

  let firstLeftOnly: ProductState | null = null;
  let firstRightOnly: ProductState | null = null;

  const discover = (l: number, r: number, witness: string): number => {
    const id = states.length;
    const cls = acceptClassOf(lAccept.has(l), rAccept.has(r));
    const state: ProductState = { id, left: l, right: r, acceptClass: cls, witness };
    states.push(state);
    idOf.set(`${l}:${r}`, id);
    if (cls === 'left-only' && !firstLeftOnly) firstLeftOnly = state;
    if (cls === 'right-only' && !firstRightOnly) firstRightOnly = state;
    return id;
  };

  const steps: ProductStep[] = [];

  // ---- 第 0 帧：组合初态 = (左初态, 右初态) ----
  const startId = discover(left.dfa.start, right.dfa.start, '');
  const queue: number[] = [startId];

  steps.push({
    index: 0,
    kind: 'init',
    title: '第 1 步：两台机器从各自初态同步出发',
    description:
      `组合初态 = (M${left.dfa.start}, M${right.dfa.start})，到达串是空串 ε。` +
      `两台机器此后读完全相同的符号、各走各的转移；并集字母表为 ` +
      `${alphabet.length ? '`' + alphabet.join(', ') + '`' : '∅'}。` +
      `组合状态按接受性染成四类：两边都接受 / 仅左接受 / 仅右接受 / 两边都不接受。`,
    stateCount: 1,
    newTransition: -1,
    currentState: startId,
    symbol: null,
    newState: startId,
    targetState: null,
    frontier: [...queue],
  });

  let stepIndex = 1;

  while (queue.length) {
    const cur = queue.shift()!;
    const ps = states[cur];

    steps.push({
      index: stepIndex++,
      kind: 'expand',
      title: `展开组合状态 ${stateName(ps, left.deadState, right.deadState)}`,
      description:
        `状态 ${stateName(ps, left.deadState, right.deadState)} 的到达串是 ` +
        `${ps.witness === '' ? 'ε（空串）' : `"${ps.witness}"`}，接受类型为「${classLabel(ps.acceptClass)}」。` +
        '按并集字母表逐符号同步推进两台机器。',
      stateCount: states.length,
      newTransition: -1,
      currentState: cur,
      symbol: null,
      newState: null,
      targetState: null,
      frontier: [...queue],
    });

    for (const sym of alphabet) {
      const nl = ltm.get(`${ps.left}:${sym}`)!;
      const nr = rtm.get(`${ps.right}:${sym}`)!;
      const existing = stateId(nl, nr);
      const isNew = existing === null;
      let targetId: number;

      if (isNew) {
        if (states.length >= MAX_PRODUCT_STATES) {
          throw new CompareLimitError(states.length + 1);
        }
        targetId = discover(nl, nr, ps.witness + sym);
        queue.push(targetId);
      } else {
        targetId = existing;
      }

      // 转移严格按 BFS 顺序追加，下标即播放时的累积切片位置
      const transitionIndex = transitions.length;
      transitions.push({ from: cur, symbol: sym, to: targetId });

      const targetState = states[targetId];
      steps.push({
        index: stepIndex++,
        kind: 'expand',
        title: `读 "${sym}" → ${stateName(targetState, left.deadState, right.deadState)}${
          isNew ? '（新组合状态）' : ''
        }`,
        description:
          `左边 M${ps.left} --${sym}--> M${nl}，右边 M${ps.right} --${sym}--> M${nr}，` +
          `同步到达 ${stateName(targetState, left.deadState, right.deadState)}。` +
          (isNew
            ? `这是第一次到达的组合对，登记为 P${targetId}，接受类型为「${classLabel(
                targetState.acceptClass,
              )}」。`
            : `该组合对此前已经到达过（记为 P${targetId}），只连边、不重复登记。`),
        stateCount: states.length,
        newTransition: transitionIndex,
        currentState: cur,
        symbol: sym,
        newState: isNew ? targetId : null,
        targetState: targetId,
        frontier: [...queue],
      });
    }
  }

  // ---- 结论帧 ----
  const leftOnly = makeCounterexample(firstLeftOnly);
  const rightOnly = makeCounterexample(firstRightOnly);
  const relation: CompareRelation = !leftOnly.exists
    ? !rightOnly.exists
      ? 'equivalent'
      : 'left_subset_right'
    : !rightOnly.exists
      ? 'right_subset_left'
      : 'incomparable';

  steps.push({
    index: stepIndex,
    kind: 'finish',
    title: `对拍完成：${relationLabel(relation)}`,
    description: buildFinishDescription(relation, firstLeftOnly, firstRightOnly),
    stateCount: states.length,
    newTransition: -1,
    currentState: null,
    symbol: null,
    newState: null,
    targetState: null,
    frontier: [],
  });

  return {
    left,
    right,
    alphabet,
    relation,
    leftOnly,
    rightOnly,
    product: {
      start: startId,
      states,
      transitions,
      accepting: {
        both: states.filter((s) => s.acceptClass === 'both').map((s) => s.id),
        leftOnly: states.filter((s) => s.acceptClass === 'left-only').map((s) => s.id),
        rightOnly: states.filter((s) => s.acceptClass === 'right-only').map((s) => s.id),
      },
    },
    steps,
  };
}

/** 组合状态的显示名：死状态分量加 † 标记 */
export function stateName(ps: ProductState, leftDead: number, rightDead: number): string {
  const l = ps.left === leftDead ? '†' : `M${ps.left}`;
  const r = ps.right === rightDead ? '†' : `M${ps.right}`;
  return `P${ps.id}(${l}, ${r})`;
}

function classLabel(cls: ProductAcceptClass): string {
  switch (cls) {
    case 'both':
      return '两边都接受';
    case 'left-only':
      return '只有左边接受';
    case 'right-only':
      return '只有右边接受';
    case 'neither':
      return '两边都不接受';
  }
}

function relationLabel(relation: CompareRelation): string {
  switch (relation) {
    case 'equivalent':
      return '两边等价';
    case 'left_subset_right':
      return '左边的语言真包含于右边';
    case 'right_subset_left':
      return '右边的语言真包含于左边';
    case 'incomparable':
      return '互不包含';
  }
}

function witnessText(w: string): string {
  return w === '' ? '空串 ε' : `"${w}"`;
}

function buildFinishDescription(
  relation: CompareRelation,
  lOnly: ProductState | null,
  rOnly: ProductState | null,
): string {
  switch (relation) {
    case 'equivalent':
      return '乘积图中没有任何"仅一边接受"的组合状态：任意串在两台上结论都相同，两条正则描述同一个语言。';
    case 'left_subset_right':
      return (
        `存在"只有右边接受"的组合状态（如到达串 ${witnessText(rOnly!.witness)}），` +
        '但不存在"只有左边接受"的状态：左边的每个串右边都接受，反之不然，故 L(左) ⊊ L(右)。'
      );
    case 'right_subset_left':
      return (
        `存在"只有左边接受"的组合状态（如到达串 ${witnessText(lOnly!.witness)}），` +
        '但不存在"只有右边接受"的状态：右边的每个串左边都接受，反之不然，故 L(右) ⊊ L(左)。'
      );
    case 'incomparable':
      return (
        `两个方向的差集都非空：${witnessText(lOnly!.witness)} 只被左边接受，` +
        `${witnessText(rOnly!.witness)} 只被右边接受，故两边互不包含。`
      );
  }
}

// ---------------------------------------------------------------------------
// 批量对拍：一条标准答案配至多 MAX_BATCH_STUDENTS 条学生答案。
// 标准答案只解析/构造一次；单条学生答案出错只影响它自己那一条。
// ---------------------------------------------------------------------------

export const MAX_BATCH_STUDENTS = 30;

export function compareBatch(reference: string, students: string[]): BatchCompareResult {
  if (students.length > MAX_BATCH_STUDENTS) {
    throw new Error(`学生答案数量超过上限（最多 ${MAX_BATCH_STUDENTS} 条，收到 ${students.length} 条）`);
  }
  // 标准答案本身非法属于整个请求的错误（400），在路由层先拦；这里再兜一层
  const refBuilt = buildMinDfa(reference);
  const refAlphabet = sortByCodePoint(refBuilt.alphabet);

  const results: BatchCompareItem[] = students.map((student, index) => {
    try {
      const stuBuilt = buildMinDfa(student);
      const alphabet = sortByCodePoint([...refAlphabet, ...stuBuilt.alphabet]);
      const refCompleted = completeDfa(refBuilt.min, alphabet);
      const stuCompleted = completeDfa(stuBuilt.min, alphabet);
      const left: CompareSide = {
        regex: reference,
        ownAlphabet: [...refAlphabet],
        dfa: refCompleted.dfa,
        deadState: refCompleted.deadState,
      };
      const right: CompareSide = {
        regex: student,
        ownAlphabet: sortByCodePoint(stuBuilt.alphabet),
        dfa: stuCompleted.dfa,
        deadState: stuCompleted.deadState,
      };
      const cmp = buildProduct(left, right, alphabet);
      return {
        index,
        student,
        ok: true,
        relation: cmp.relation,
        leftOnly: cmp.leftOnly,
        rightOnly: cmp.rightOnly,
      };
    } catch (err) {
      if (err instanceof ParseError) {
        return {
          index,
          student,
          ok: false,
          error: { error: err.message, position: err.position },
        };
      }
      if (err instanceof CompareLimitError) {
        return {
          index,
          student,
          ok: false,
          error: { error: err.message, code: err.code },
        };
      }
      return {
        index,
        student,
        ok: false,
        error: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  });

  return {
    reference,
    alphabet: [...refAlphabet],
    results,
  };
}

/**
 * 答案对拍：判定两条正则描述的语言之间的关系，并在两台机器同步运行形成的
 * 乘积自动机（product automaton）上录下逐步展开过程。
 *
 * 判定方法（语言等价/包含的经典乘积构造）：
 *   1. 两条正则各自走完整流水线（NFA → DFA → 最小化 DFA）；
 *   2. 字母表取两边的并集（a* 对 (a|b)* 时，左边也要能读到 b）；
 *   3. 把两台 DFA 在并集字母表上"补全"：缺失的转移显式落入一个死状态，
 *      再最小化一次（原有的死路状态会和补出的死状态合并）；
 *   4. 乘积状态是一对 (左状态, 右状态)，同步读同一个符号一起转移；
 *      按"两边接受性"把乘积状态分成 both / leftOnly / rightOnly / neither 四类：
 *        - 任何可达的 leftOnly  状态 ⇒ 左 \\ 右 差集非空（存在只被左边接受的串）；
 *        - 任何可达的 rightOnly 状态 ⇒ 右 \\ 左 差集非空。
 *      两个差集都空 ⇒ 等价；只有一个非空 ⇒ 对应方向的真包含；都非空 ⇒ 互不包含。
 *
 * 反例选取：乘积状态按"分层 BFS + 同层按码点字典序"发现，每个状态记录到达它的
 * witness 串。由于出边按 codePoint 升序展开，同一目标第一次被发现时拿到的必然是
 * "长度最短、长度相同则逐位码点最小"的串——shortlex 序的第一条。该选择只依赖
 * 语言本身，与左右摆放顺序无关，所以交换左右后反例串保持不变。
 */

import { parseRegex } from '../parser/regexParser';
import { buildThompson } from './thompson';
import { buildSubsetDfa } from './subset';
import { minimizeDfa } from './hopcroft';
import type {
  CompareMachine,
  CompareResult,
  CompareStep,
  DfaTransition,
  MinDFA,
  ProductCategory,
  ProductState,
  Symbol,
} from './types';

/** 乘积状态数量上限：超过即明确报错，避免复杂正则把请求挂死 */
export const MAX_PRODUCT_STATES = 400;

/** 按码点升序排列符号（反例的字典序与这个顺序一致） */
export function sortSymbols(symbols: Symbol[]): Symbol[] {
  return [...symbols].sort((a, b) => codePointOf(a) - codePointOf(b));
}

function codePointOf(s: Symbol): number {
  // 本工具字母表中的符号都是单码点字符（解析器按单个 codePoint 收集）
  return s.codePointAt(0)!;
}

/** 两边字母表的并集，按首次出现顺序保留（展示用；计算时另按码点排序） */
function unionAlphabet(a: Symbol[], b: Symbol[]): Symbol[] {
  const out: Symbol[] = [];
  for (const s of [...a, ...b]) if (!out.includes(s)) out.push(s);
  return out;
}

/**
 * 把一台最小化 DFA 补成并集字母表上的完整 DFA（缺转移显式落入死状态），
 * 再最小化一次。新增的死状态编号 = 原状态数；若最小化后它被并入原有死路组，
 * 则按成员映射定位最终的死状态（最小化的完整 DFA 至多一个非生产性死状态）。
 */
export function completeMachine(min: MinDFA, alphabet: Symbol[]): CompareMachine {
  const sortedAlphabet = sortSymbols(alphabet);
  const nOld = min.states.length;
  const dead = nOld;

  const transMap = new Map<string, number>();
  for (const t of min.transitions) transMap.set(`${t.from}:${t.symbol}`, t.to);

  const completedTransitions: DfaTransition[] = [];
  for (let s = 0; s <= nOld; s++) {
    for (const sym of sortedAlphabet) {
      const existing = s < dead ? transMap.get(`${s}:${sym}`) : undefined;
      completedTransitions.push({ from: s, symbol: sym, to: existing ?? dead });
    }
  }

  const completed: MinDFA = {
    states: [...min.states, dead],
    start: min.start,
    accepting: [...min.accepting],
    transitions: completedTransitions,
    alphabet: sortedAlphabet,
    members: Object.fromEntries([
      ...min.states.map((s) => [s, [s]]),
      [dead, [dead]],
    ]),
  };

  const { min: minimized } = minimizeDfa(completed);

  // 在最小化后的完整 DFA 上找死状态：非接受、且任何路径都到不了接受态的状态。
  // 从接受态沿反向边传播"生产性"，接受态自身天然生产；
  // 注意不能把接受汇点（如 (a|b)* 的接受态，所有转移都指向自己）误判成死状态。
  const reverse = new Map<number, number[]>();
  for (const t of minimized.transitions) {
    const list = reverse.get(t.to);
    if (list) list.push(t.from);
    else reverse.set(t.to, [t.from]);
  }
  const productive = new Set<number>(minimized.accepting);
  const stack = [...minimized.accepting];
  while (stack.length) {
    const s = stack.pop()!;
    for (const p of reverse.get(s) ?? []) {
      if (!productive.has(p)) {
        productive.add(p);
        stack.push(p);
      }
    }
  }
  const acceptSet = new Set(minimized.accepting);
  const deadStates = minimized.states.filter((s) => !productive.has(s) && !acceptSet.has(s));
  const deadState = deadStates.length
    ? Math.min(...deadStates)
    : // 理论上不会发生（所有语言都有拒绝串时才有死状态）；没有死状态时用 -1 标记
      -1;

  return {
    states: minimized.states,
    start: minimized.start,
    accepting: minimized.accepting,
    transitions: minimized.transitions,
    alphabet: sortedAlphabet,
    deadState,
  };
}

function categoryOf(leftAccept: boolean, rightAccept: boolean): ProductCategory {
  if (leftAccept && rightAccept) return 'both';
  if (leftAccept) return 'leftOnly';
  if (rightAccept) return 'rightOnly';
  return 'neither';
}

function relationOf(hasLeftOnly: boolean, hasRightOnly: boolean): CompareResult['relation'] {
  if (!hasLeftOnly && !hasRightOnly) return 'equal';
  if (hasLeftOnly && !hasRightOnly) return 'left_subset';
  if (!hasLeftOnly && hasRightOnly) return 'right_subset';
  return 'incomparable';
}

export interface CompareOptions {
  /** 乘积状态上限（测试可调小以触发超限错误），默认 MAX_PRODUCT_STATES */
  maxProductStates?: number;
}

/**
 * 对拍核心：两条正则 → 语言关系 + 两台补全机器 + 乘积自动机 + 逐步数据 + 反例。
 * 解析错误直接向上抛 ParseError（由路由层区分左右）。
 */
export function compareRegexes(
  leftRegex: string,
  rightRegex: string,
  options: CompareOptions = {},
): CompareResult {
  const maxStates = options.maxProductStates ?? MAX_PRODUCT_STATES;

  const leftParsed = parseRegex(leftRegex);
  const rightParsed = parseRegex(rightRegex);

  const buildMachine = (parsed: ReturnType<typeof parseRegex>) => {
    const { nfa } = buildThompson(parsed.ast, parsed.alphabet);
    const { dfa } = buildSubsetDfa(nfa);
    const { min } = minimizeDfa(dfa);
    return min;
  };
  const leftMin = buildMachine(leftParsed);
  const rightMin = buildMachine(rightParsed);

  const alphabet = unionAlphabet(leftParsed.alphabet, rightParsed.alphabet);
  const left = completeMachine(leftMin, alphabet);
  const right = completeMachine(rightMin, alphabet);
  const orderedAlphabet = left.alphabet; // 两边已统一成码点排序的并集

  const leftAccept = new Set(left.accepting);
  const rightAccept = new Set(right.accepting);
  const leftMove = new Map<string, number>();
  const rightMove = new Map<string, number>();
  for (const t of left.transitions) leftMove.set(`${t.from}:${t.symbol}`, t.to);
  for (const t of right.transitions) rightMove.set(`${t.from}:${t.symbol}`, t.to);

  // ---- 乘积自动机 BFS（shortlex：队列分层，出边按码点升序） ----
  const steps: CompareStep[] = [];
  const states: ProductState[] = [];
  const transitions: DfaTransition[] = [];
  const idByPair = new Map<string, number>();

  const discover = (l: number, r: number, witness: string): number => {
    const id = states.length;
    states.push({
      id,
      left: l,
      right: r,
      category: categoryOf(leftAccept.has(l), rightAccept.has(r)),
      witness,
    });
    idByPair.set(`${l},${r}`, id);
    return id;
  };

  const snapshotStates = () => states.map((s) => ({ ...s }));
  const snapshotTransitions = () => transitions.map((t) => ({ ...t }));

  const startId = discover(left.start, right.start, '');
  const queue: number[] = [startId];

  let leftOnlyWitness: string | null = null;
  let rightOnlyWitness: string | null = null;
  if (states[0].category === 'leftOnly') leftOnlyWitness = '';
  if (states[0].category === 'rightOnly') rightOnlyWitness = '';

  const pairName = (s: ProductState) => `(L${s.left}, R${s.right})`;
  const categoryText = (c: ProductCategory): string =>
    c === 'both'
      ? '两边都接受'
      : c === 'leftOnly'
        ? '只有左边接受'
        : c === 'rightOnly'
          ? '只有右边接受'
          : '两边都不接受';

  steps.push({
    index: 0,
    kind: 'init',
    title: '组合初态：两台机器各站在自己的初态',
    description:
      `组合状态 (L${left.start}, R${right.start}) 表示"左边读到当前串后停在 L${left.start}，` +
      `右边停在 R${right.start}"。它的类别是「${categoryText(states[0].category)}」。` +
      `之后两台机器始终读同一个字符、同步前进。判定字母表为两边并集：` +
      `${orderedAlphabet.map((s) => `"${s}"`).join('、') || '（空）'}；缺失的转移已显式补到死状态。`,
    currentState: startId,
    symbol: null,
    newState: startId,
    targetState: null,
    states: snapshotStates(),
    transitions: [],
    frontier: [...queue],
  });

  let stepIndex = 1;
  let capped = false;

  while (queue.length) {
    const current = queue.shift()!;
    const cur = states[current];

    steps.push({
      index: stepIndex++,
      kind: 'process',
      title: `展开组合状态 ${pairName(cur)}`,
      description:
        `从 ${pairName(cur)}（${categoryText(cur.category)}）出发，` +
        `按并集字母表逐符号同步转移：两台机器各读同一个符号，落到各自的下一状态，组成新的组合状态。`,
      currentState: current,
      symbol: null,
      newState: null,
      targetState: null,
      states: snapshotStates(),
      transitions: snapshotTransitions(),
      frontier: [...queue],
    });

    for (const sym of orderedAlphabet) {
      const nl = leftMove.get(`${cur.left}:${sym}`)!;
      const nr = rightMove.get(`${cur.right}:${sym}`)!;
      const key = `${nl},${nr}`;
      const existing = idByPair.get(key);
      const isNew = existing === undefined;
      let target: number;
      let targetState: ProductState;

      if (isNew) {
        if (states.length >= maxStates) {
          capped = true;
          break;
        }
        target = discover(nl, nr, cur.witness + sym);
        targetState = states[target];
        queue.push(target);
        if (targetState.category === 'leftOnly' && leftOnlyWitness === null) {
          leftOnlyWitness = targetState.witness;
        }
        if (targetState.category === 'rightOnly' && rightOnlyWitness === null) {
          rightOnlyWitness = targetState.witness;
        }
      } else {
        target = existing;
        targetState = states[target];
      }

      transitions.push({ from: current, symbol: sym, to: target });

      steps.push({
        index: stepIndex++,
        kind: 'process',
        title: `${pairName(cur)} --${sym}--> ${pairName(targetState)}${isNew ? '（新组合状态）' : ''}`,
        description:
          `左边 L${cur.left} 读 "${sym}" 到 L${nl}，右边 R${cur.right} 读 "${sym}" 到 R${nr}，` +
          (isNew
            ? `得到首次出现的组合状态 ${pairName(targetState)}，类别「${categoryText(
                targetState.category,
              )}」${
                targetState.category === 'leftOnly' || targetState.category === 'rightOnly'
                  ? '——它就是该方向差集的一个反例落点（BFS 保证这是最短、最靠前的一条）。'
                  : targetState.category === 'both'
                    ? '（两边都接受，不是反例）。'
                    : '（两边都不接受，也不是反例）。'
              }`
            : `该组合状态之前已经发现过，直接连边。`),
        currentState: current,
        symbol: sym,
        newState: isNew ? target : null,
        targetState: target,
        states: snapshotStates(),
        transitions: snapshotTransitions(),
        frontier: [...queue],
      });
    }

    if (capped) break;
  }

  if (capped) {
    throw new Error(
      `组合状态数量超过上限 ${maxStates}：两条正则的乘积自动机过大，请换更简单的正则或减小字母表`,
    );
  }

  const relation = relationOf(leftOnlyWitness !== null, rightOnlyWitness !== null);

  steps.push({
    index: stepIndex,
    kind: 'finish',
    title: '组合状态展开完毕',
    description:
      `待处理队列为空，乘积自动机共 ${states.length} 个组合状态。` +
      (relation === 'equal'
        ? '可达状态里没有任何"只有一边接受"的组合状态，两个语言完全等价。'
        : [
            leftOnlyWitness !== null
              ? `存在「只有左边接受」的状态，左 \\ 右 差集非空，反例为 ${JSON.stringify(
                  leftOnlyWitness,
                )}`
              : null,
            rightOnlyWitness !== null
              ? `存在「只有右边接受」的状态，右 \\ 左 差集非空，反例为 ${JSON.stringify(
                  rightOnlyWitness,
                )}`
              : null,
          ]
            .filter(Boolean)
            .join('；') + '。'),
    currentState: null,
    symbol: null,
    newState: null,
    targetState: null,
    states: snapshotStates(),
    transitions: snapshotTransitions(),
    frontier: [],
  });

  return {
    leftRegex,
    rightRegex,
    relation,
    alphabet: orderedAlphabet,
    leftMachine: left,
    rightMachine: right,
    product: {
      start: startId,
      states,
      transitions,
    },
    steps,
    leftOnlyWitness,
    rightOnlyWitness,
  };
}

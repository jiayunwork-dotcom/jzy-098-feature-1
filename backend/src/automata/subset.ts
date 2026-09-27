/**
 * 子集构造（NFA → DFA）。
 *
 * 教科书迭代过程，每一步都录成 SubsetStep 供前端逐步演示：
 *   1. DFA 初态 = ε-closure({NFA 初态})
 *   2. 从待处理队列取出一个 DFA 状态 T，对字母表每个符号 a：
 *        U = ε-closure(move(T, a))
 *        若 U 非空且未出现过，则它是一个新的 DFA 状态
 *   3. 队列为空时结束（隐式死状态不画出来，保持图简洁）
 *
 * DFA 状态 id 采用发现顺序 0..n-1。
 */

import type {
  DFA,
  DfaTransition,
  NFA,
  SubsetRow,
  SubsetStep,
  Symbol,
} from './types';
import { NFA_EPSILON } from './thompson';

const MAX_DFA_STATES = 200;

const keyOf = (set: number[]): string => [...set].sort((a, b) => a - b).join(',');

function epsilonClosure(nfa: NFA, seeds: number[]): number[] {
  const reached = new Set<number>(seeds);
  const stack = [...seeds];
  while (stack.length) {
    const s = stack.pop()!;
    for (const e of nfa.edges) {
      if (e.from === s && e.symbol === NFA_EPSILON && !reached.has(e.to)) {
        reached.add(e.to);
        stack.push(e.to);
      }
    }
  }
  return [...reached].sort((a, b) => a - b);
}

function move(nfa: NFA, from: Iterable<number>, symbol: Symbol): number[] {
  const out = new Set<number>();
  const seedSet = new Set(from);
  for (const e of nfa.edges) {
    if (seedSet.has(e.from) && e.symbol === symbol) out.add(e.to);
  }
  return [...out].sort((a, b) => a - b);
}

export interface SubsetOutput {
  dfa: DFA;
  table: SubsetRow[];
  steps: SubsetStep[];
}

export function buildSubsetDfa(nfa: NFA): SubsetOutput {
  const alphabet = nfa.alphabet;
  const steps: SubsetStep[] = [];

  /** 已发现的 DFA 状态，按发现顺序排列，下标即状态 id */
  const dfaSets: number[][] = [];
  const keyToId = new Map<string, number>();
  const accepting: number[] = [];
  const transitions: DfaTransition[] = [];
  const rows: SubsetRow[] = [];

  const isAccepting = (members: number[]) =>
    members.some((m) => nfa.states.find((s) => s.id === m)?.accepting);

  const discover = (members: number[]): number => {
    const id = dfaSets.length;
    dfaSets.push(members);
    keyToId.set(keyOf(members), id);
    if (isAccepting(members)) accepting.push(id);
    rows.push({ state: id, members: [...members], accepting: isAccepting(members) });
    return id;
  };

  const snapshotRows = () => rows.map((r) => ({ ...r, members: [...r.members] }));
  const snapshotTransitions = () => transitions.map((t) => ({ ...t }));

  // ---- 第 0 步：初始闭包 ----
  const startMembers = epsilonClosure(nfa, [nfa.start]);
  const startId = discover(startMembers);
  const queue: number[] = [startId];
  const processed = new Set<number>();

  steps.push({
    index: 0,
    kind: 'init',
    title: '第 1 步：求初始状态的 ε-闭包',
    description: `DFA 的初态 D0 = ε-closure({s${nfa.start}})，包含 NFA 状态 {${startMembers
      .map((m) => `s${m}`)
      .join(', ')}}。闭包的含义：从这些状态只沿 ε 边能到达的所有状态。`,
    nfaHighlight: [...startMembers],
    currentState: startId,
    symbol: null,
    newState: startId,
    targetState: null,
    rows: snapshotRows(),
    transitions: [],
    frontier: [...queue],
  });

  let stepIndex = 1;

  while (queue.length) {
    const dfaState = queue.shift()!;
    processed.add(dfaState);
    const members = dfaSets[dfaState];

    // 取出一个未处理子集，逐个符号展开
    steps.push({
      index: stepIndex++,
      kind: 'process',
      title: `处理 D${dfaState}：逐符号求 move 与闭包`,
      description: `从子集 {${members
        .map((m) => `s${m}`)
        .join(', ')}} 出发，按字母表 ${'`' + alphabet.map(String).join(', ') + '`'} 的每个符号各算一次：先 move（沿该符号的边），再做 ε-闭包。`,
      nfaHighlight: [...members],
      currentState: dfaState,
      symbol: null,
      newState: null,
      targetState: null,
      rows: snapshotRows(),
      transitions: snapshotTransitions(),
      frontier: [...queue],
    });

    for (const symbol of alphabet) {
      const moved = move(nfa, members, symbol);
      const reached = epsilonClosure(nfa, moved);
      if (reached.length === 0) {
        steps.push({
          index: stepIndex++,
          kind: 'process',
          title: `D${dfaState} --${symbol}--> 无路可走`,
          description: `move(D${dfaState}, "${symbol}") 为空：该子集里没有任何 NFA 状态发出 "${symbol}" 边。这个符号上不存在转移（可理解为落入隐式死状态，图中不画出）。`,
          nfaHighlight: [...members],
          currentState: dfaState,
          symbol,
          newState: null,
          targetState: null,
          rows: snapshotRows(),
          transitions: snapshotTransitions(),
          frontier: [...queue],
        });
        continue;
      }

      const key = keyOf(reached);
      const existing = keyToId.get(key);
      const isNew = existing === undefined;
      if (isNew && dfaSets.length >= MAX_DFA_STATES) {
        throw new Error(
          `确定化产生的状态过多（超过 ${MAX_DFA_STATES} 个），请换一条更简单的正则`,
        );
      }
      const target: number = isNew ? discover(reached) : existing;
      if (isNew) queue.push(target);

      transitions.push({ from: dfaState, symbol, to: target! });

      steps.push({
        index: stepIndex++,
        kind: 'process',
        title: `D${dfaState} --${symbol}--> D${target}${isNew ? '（新状态）' : ''}`,
        description:
          `move(D${dfaState}, "${symbol}") = {${moved.map((m) => `s${m}`).join(', ') || '∅'}}，` +
          `再做 ε-闭包得到 {${reached.map((m) => `s${m}`).join(', ')}}` +
          (isNew
            ? `，这是第一次出现的子集，登记为新 DFA 状态 D${target}${
                isAccepting(reached) ? '（含 NFA 接受态，故为接受态）' : ''
              }。`
            : `，它已经登记为 D${target}，直接连边即可。`),
        nfaHighlight: [...reached],
        currentState: dfaState,
        symbol,
        newState: isNew ? target : null,
        targetState: target,
        rows: snapshotRows(),
        transitions: snapshotTransitions(),
        frontier: [...queue],
      });
    }
  }

  const dfa: DFA = {
    states: dfaSets.map((_, i) => i),
    start: startId,
    accepting,
    transitions,
    alphabet,
  };

  steps.push({
    index: stepIndex,
    kind: 'finish',
    title: '确定化完成',
    description: `待处理队列为空，DFA 共 ${dfa.states.length} 个状态${
      accepting.length ? `，其中接受态为 ${accepting.map((a) => `D${a}`).join('、')}` : ''
    }。每一行子集对照都对应图中一个圆圈。`,
    nfaHighlight: [],
    currentState: null,
    symbol: null,
    newState: null,
    targetState: null,
    rows: snapshotRows(),
    transitions: snapshotTransitions(),
    frontier: [],
  });

  return { dfa, table: rows.map((r) => ({ ...r, members: [...r.members] })), steps };
}

export { epsilonClosure, move as nfaMove };

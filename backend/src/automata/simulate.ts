/**
 * 测试串模拟：在三台机器上分别跑同一个串，产出逐步轨迹。
 *
 * - NFA：逐步维护"当前活动状态集合"（先 ε 闭包；读一个字符做 move，再闭包）
 * - DFA / 最小化 DFA：沿唯一转移走，遇到缺失转移立即拒绝（隐式死状态）
 *
 * 每条轨迹都可以在前端逐字符回放，并高亮走过的状态/边。
 */

import { epsilonClosure, nfaMove } from './subset';
import type { DFA, DfaTrace, MinDFA, NFA, NfaTrace, SimulateResult, Symbol } from './types';

export const MAX_INPUT_LENGTH = 200;

export function simulateNfa(nfa: NFA, input: string): NfaTrace {
  const chars = [...input];
  const steps = [
    {
      index: 0,
      consumed: 0,
      active: epsilonClosure(nfa, [nfa.start]),
      symbol: null as Symbol | null,
    },
  ];

  for (let i = 0; i < chars.length; i++) {
    const prev = steps[i].active;
    const moved = nfaMove(nfa, prev, chars[i]);
    const active = epsilonClosure(nfa, moved);
    steps.push({
      index: i + 1,
      consumed: i + 1,
      active,
      symbol: chars[i],
    });
  }

  const finalActive = steps[steps.length - 1].active;
  const accepted = finalActive.includes(nfa.accept);
  return { steps, accepted };
}

/** 在 DFA（或最小化 DFA）上模拟；edgeKey 供前端高亮走过的边 */
function simulateDfaLike(
  dfa: Pick<DFA, 'start' | 'transitions'>,
  input: string,
): DfaTrace {
  const chars = [...input];
  const transition = new Map<string, number>();
  for (const t of dfa.transitions) transition.set(`${t.from}:${t.symbol}`, t.to);
  const acceptSet = new Set<number>();
  // MinDFA / DFA 结构相同，accepting 由调用方一起传入时这里用 duck-typing：
  const accepting = (dfa as DFA).accepting ?? (dfa as unknown as MinDFA).accepting;
  for (const a of accepting) acceptSet.add(a);

  const steps: DfaTrace['steps'] = [
    { index: 0, state: dfa.start, symbol: null, edgeKey: null },
  ];

  let state = dfa.start;
  let rejectedAt: { state: number; symbol: Symbol } | null = null;

  for (let i = 0; i < chars.length; i++) {
    const next = transition.get(`${state}:${chars[i]}`);
    if (next === undefined) {
      rejectedAt = { state, symbol: chars[i] };
      // 之后停留在"死状态"，不再产生新状态点；轨迹到此为止
      break;
    }
    steps.push({
      index: i + 1,
      state: next,
      symbol: chars[i],
      edgeKey: `${state}->${next}`,
    });
    state = next;
  }

  const consumed = steps.length - 1;
  const accepted = rejectedAt === null && chars.length === consumed && acceptSet.has(state);
  return { steps, accepted, rejectedAt };
}

export function simulateDfa(dfa: DFA, input: string): DfaTrace {
  return simulateDfaLike(dfa, input);
}

export function simulateMinDfa(min: MinDFA, input: string): DfaTrace {
  return simulateDfaLike(min, input);
}

export function simulateAll(
  nfa: NFA,
  dfa: DFA,
  min: MinDFA,
  input: string,
): SimulateResult {
  if ([...input].length > MAX_INPUT_LENGTH) {
    throw new Error(`测试串过长（最多 ${MAX_INPUT_LENGTH} 个字符）`);
  }
  const nfaTrace = simulateNfa(nfa, input);
  const dfaTrace = simulateDfa(dfa, input);
  const minTrace = simulateMinDfa(min, input);
  return {
    input,
    nfa: nfaTrace,
    dfa: dfaTrace,
    min: minTrace,
    agreement:
      nfaTrace.accepted === dfaTrace.accepted &&
      dfaTrace.accepted === minTrace.accepted,
  };
}

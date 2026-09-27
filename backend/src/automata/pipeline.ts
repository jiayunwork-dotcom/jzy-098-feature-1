/**
 * 流水线编排：正则 → AST → NFA → DFA → 最小化 DFA。
 * 路由层只负责 HTTP，所有构造逻辑在这里按模块依次调用。
 */

import { parseRegex } from '../parser/regexParser';
import { buildThompson, groupEdges } from './thompson';
import { buildSubsetDfa } from './subset';
import { minimizeDfa } from './hopcroft';
import type { ConstructResult } from './types';

export function constructPipeline(regex: string): ConstructResult {
  const { ast, alphabet } = parseRegex(regex);
  const { nfa, steps: nfaSteps } = buildThompson(ast, alphabet);
  const graphEdges = groupEdges(nfa);
  const { dfa, table, steps: dfaSteps } = buildSubsetDfa(nfa);
  const { min, steps: hopSteps } = minimizeDfa(dfa);

  return {
    regex,
    astRootId: ast.id,
    nfa: {
      states: nfa.states.map((s) => ({ id: s.id, accepting: s.accepting, astId: s.astId })),
      edges: nfa.edges,
      start: nfa.start,
      accept: nfa.accept,
      alphabet: nfa.alphabet,
      graphEdges,
    },
    nfaSteps,
    subsetTable: table,
    dfaSteps,
    dfa,
    hopSteps,
    minDfa: min,
  };
}

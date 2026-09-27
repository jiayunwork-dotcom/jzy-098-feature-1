/**
 * 正确性主线测试：对一批覆盖各类算子的正则，穷举字母表上的短串，
 * 断言 NFA / DFA / 最小化 DFA 三者的接受结论完全一致，
 * 并且与"直接在 AST 上递归"的参考语义一致。
 */

import { describe, expect, it } from 'vitest';
import { parseRegex } from '../src/parser/regexParser';
import { buildThompson } from '../src/automata/thompson';
import { buildSubsetDfa } from '../src/automata/subset';
import { minimizeDfa } from '../src/automata/hopcroft';
import { simulateDfa, simulateMinDfa, simulateNfa } from '../src/automata/simulate';
import type { AstNode, Symbol } from '../src/automata/types';

const REGEXES = [
  'a',
  'ab',
  'a|b',
  'a*',
  'a+',
  'a?',
  '(a|b)*abb',
  '[a-zA-Z_][a-zA-Z0-9_]*',
  '(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?',
  '(ab|a)*b(a|b)?',
  'colou?r+',
  '(a|b|c)*',
  'a*b*c*',
  '((a))',
  'ab?',
  '()*a',
  '[abc]+[0-9]?',
  'a(b|c)*d+',
  '\\d+',
  '"(\\\\.|[ a-z])*"',
  // 纯连接（回归：后处理重排曾把多字符连接的边指错）
  'abc',
  'a\\.b',
  '\\\\q',
  'ab(cd)+ef',
];

/** 参考语义：直接按 AST 递归做"剩余后缀"式识别 */
function astAccepts(node: AstNode, input: string, pos = 0): boolean {
  const continuations = (n: AstNode, p: number, cont: (q: number) => boolean): boolean => {
    switch (n.kind) {
      case 'char':
        return input[p] === n.symbol && cont(p + 1);
      case 'epsilon':
        return cont(p);
      case 'class':
        return n.symbols.includes(input[p]) && cont(p + 1);
      case 'concat':
        return continuations(n.left, p, (q) => continuations(n.right, q, cont));
      case 'union':
        return continuations(n.left, p, cont) || continuations(n.right, p, cont);
      case 'optional':
        return continuations(n.child, p, cont) || cont(p);
      case 'star':
        return (
          cont(p) ||
          continuations(n.child, p, (q) => q > p && continuations(n, q, cont))
        );
      case 'plus':
        return continuations(n.child, p, (q) =>
          continuations({ id: -1, kind: 'star', child: n.child }, q, cont),
        );
    }
  };
  return continuations(node, pos, (q) => q === input.length);
}

function enumerateStrings(alphabet: Symbol[], maxLen: number): string[] {
  const out: string[] = [''];
  let frontier = [''];
  for (let len = 1; len <= maxLen; len++) {
    const next: string[] = [];
    for (const prefix of frontier) {
      for (const sym of alphabet) next.push(prefix + sym);
    }
    out.push(...next);
    frontier = next;
  }
  return out;
}

describe('三台自动机一致性主线', () => {
  for (const regex of REGEXES) {
    it(`正则 /${regex}/ 在所有短串上三机一致且与参考语义一致`, () => {
      const { ast, alphabet } = parseRegex(regex);
      const { nfa } = buildThompson(ast, alphabet);
      const { dfa } = buildSubsetDfa(nfa);
      const { min } = minimizeDfa(dfa);

      // 最小化 DFA 状态数不应多于 DFA
      expect(min.states.length).toBeLessThanOrEqual(dfa.states.length);
      // 子集构造保持接受态信息
      expect(dfa.accepting.length).toBeGreaterThan(0);

      // 字母表可能很大（字符类/转义），对大字母表只抽取代表性符号
      const sampleAlphabet =
        alphabet.length <= 4 ? alphabet : alphabet.filter((_, i) => i % Math.ceil(alphabet.length / 4) === 0).slice(0, 4);
      const maxLen = sampleAlphabet.length <= 2 ? 6 : 4;
      const strings = enumerateStrings(sampleAlphabet, maxLen);

      for (const s of strings) {
        const ref = astAccepts(ast, s);
        const n = simulateNfa(nfa, s).accepted;
        const d = simulateDfa(dfa, s).accepted;
        const m = simulateMinDfa(min, s).accepted;
        expect(n, `NFA 与参考语义不一致：/${regex}/ 对 ${JSON.stringify(s)}`).toBe(ref);
        expect(d, `DFA 与 NFA 不一致：/${regex}/ 对 ${JSON.stringify(s)}`).toBe(n);
        expect(m, `最小化 DFA 与 DFA 不一致：/${regex}/ 对 ${JSON.stringify(s)}`).toBe(d);
      }
    });
  }

  it('再次最小化结果幂等（已经最小的机器不会再缩小）', () => {
    const { ast, alphabet } = parseRegex('(a|b)*abb');
    const { nfa } = buildThompson(ast, alphabet);
    const { dfa } = buildSubsetDfa(nfa);
    const { min } = minimizeDfa(dfa);
    const { min: minAgain } = minimizeDfa(min);
    expect(minAgain.states.length).toBe(min.states.length);
  });

  it('(a|b)*abb 的最小化 DFA 恰有 4 个状态', () => {
    const { ast, alphabet } = parseRegex('(a|b)*abb');
    const { nfa } = buildThompson(ast, alphabet);
    const { dfa } = buildSubsetDfa(nfa);
    const { min } = minimizeDfa(dfa);
    expect(min.states.length).toBe(4);
  });
});

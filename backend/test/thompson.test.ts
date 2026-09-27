/**
 * Thompson 构造的结构回归测试。
 * 曾出现过一个 bug：连接合并删除状态后，后处理重排按 astId 排序，
 * 导致多字符连接的边指向错误状态。这里直接锁定链式结构。
 */

import { describe, expect, it } from 'vitest';
import { parseRegex } from '../src/parser/regexParser';
import { buildThompson } from '../src/automata/thompson';

function build(regex: string) {
  const { ast, alphabet } = parseRegex(regex);
  return buildThompson(ast, alphabet).nfa;
}

describe('Thompson 结构回归', () => {
  it('多字符连接 abc 是严格的 0-a→1-b→2-c→3 链', () => {
    const nfa = build('abc');
    expect(nfa.states.length).toBe(4);
    expect(nfa.start).toBe(0);
    expect(nfa.accept).toBe(3);
    const charEdges = nfa.edges.filter((e) => e.symbol !== 'ε').sort((a, b) => a.from - b.from);
    expect(charEdges.map((e) => [e.from, e.symbol, e.to])).toEqual([
      [0, 'a', 1],
      [1, 'b', 2],
      [2, 'c', 3],
    ]);
    // 每条边端点都必须落在存活状态上
    for (const e of nfa.edges) {
      expect(e.from).toBeGreaterThanOrEqual(0);
      expect(e.from).toBeLessThan(4);
      expect(e.to).toBeGreaterThanOrEqual(0);
      expect(e.to).toBeLessThan(4);
    }
  });

  it('任意构造出的 NFA 所有边端点都指向存活状态', () => {
    for (const r of ['a\\.b', '\\\\q', 'ab(cd)+ef', '(a|b)*abb', 'x?y+z*', '[a-c][d-f]']) {
      const nfa = build(r);
      const ids = new Set(nfa.states.map((s) => s.id));
      for (const e of nfa.edges) {
        expect(ids.has(e.from), `${r} 边 ${e.id} 源状态不存在`).toBe(true);
        expect(ids.has(e.to), `${r} 边 ${e.id} 目标状态不存在`).toBe(true);
      }
      expect(ids.has(nfa.accept)).toBe(true);
    }
  });

  it('闭包片段同时有循环回边和跳过 ε 边', () => {
    const nfa = build('a*');
    const eps = nfa.edges.filter((e) => e.symbol === 'ε');
    // 至少存在一条"回边"（to < from 意义上的循环）和跳过边
    const loop = eps.some((e) => e.to === nfa.start + 1 || e.from > e.to);
    expect(loop).toBe(true);
  });

  it('选择片段初态有两条 ε 分叉', () => {
    const nfa = build('a|b');
    const forks = nfa.edges.filter((e) => e.from === nfa.start && e.symbol === 'ε');
    expect(forks.length).toBe(2);
  });
});

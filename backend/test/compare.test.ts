/**
 * 答案对拍核心逻辑测试。
 *
 * 钉死的几条主线：
 *  1. 助教手算样例：四种关系 + 每条反例的确切内容（含空串反例与"无反例"的区分）；
 *  2. 每条给出的反例放到各自的三台机器（NFA/DFA/最小化 DFA）上模拟，
 *     恰好一边接受、一边拒绝，且同一边三台机器结论一致；
 *  3. 在小字母表正则对上，用长度 6 以内的穷举串交叉核对：判定结论与穷举一致，
 *     给出的反例正是穷举里按"先长度、同长按码点"排在第一的那条；
 *  4. 交换左右后包含方向对调、反例串不变；
 *  5. 批量判定里单条语法/规模出错不拖累其他条；
 *  6. 组合状态超上限明确报错。
 */

import { describe, expect, it } from 'vitest';
import {
  buildMinDfa,
  compareBatch,
  compareRegexes,
  CompareLimitError,
  MAX_BATCH_STUDENTS,
  MAX_PRODUCT_STATES,
} from '../src/automata/compare';
import { constructPipeline } from '../src/automata/pipeline';
import { simulateAll, simulateDfa, MAX_INPUT_LENGTH } from '../src/automata/simulate';
import { ParseError } from '../src/parser/regexParser';
import type { CompareRelation, DFA, Symbol } from '../src/automata/types';

// ---------------------------------------------------------------------------
// 助教给出的手算样例
// ---------------------------------------------------------------------------

describe('手算样例：关系与反例', () => {
  it('(a|b)* 与 (a*b*)* 等价', () => {
    const r = compareRegexes('(a|b)*', '(a*b*)*');
    expect(r.relation).toBe('equivalent');
    expect(r.leftOnly.exists).toBe(false);
    expect(r.leftOnly.witness).toBeNull();
    expect(r.rightOnly.exists).toBe(false);
    expect(r.rightOnly.witness).toBeNull();
  });

  it('a(ba)* 与 (ab)*a 等价', () => {
    const r = compareRegexes('a(ba)*', '(ab)*a');
    expect(r.relation).toBe('equivalent');
    expect(r.leftOnly.exists).toBe(false);
    expect(r.rightOnly.exists).toBe(false);
  });

  it('(a|b)*abb 真包含于 (a|b)*bb，反例 bb', () => {
    const r = compareRegexes('(a|b)*abb', '(a|b)*bb');
    expect(r.relation).toBe('left_subset_right');
    expect(r.leftOnly.exists).toBe(false);
    expect(r.rightOnly.exists).toBe(true);
    expect(r.rightOnly.witness).toBe('bb');
    expect(r.rightOnly.length).toBe(2);
  });

  it('a+ 真包含于 a*，反例是空串（必须与"无反例"区分开）', () => {
    const r = compareRegexes('a+', 'a*');
    expect(r.relation).toBe('left_subset_right');
    expect(r.leftOnly).toEqual({ exists: false, witness: null, length: 0, productState: null });
    expect(r.rightOnly.exists).toBe(true);
    expect(r.rightOnly.witness).toBe('');
    expect(r.rightOnly.length).toBe(0);
    expect(r.rightOnly.productState).toBe(r.product.start);
  });

  it('a* 真包含于 (a|b)*，反例 b（字母表取并集）', () => {
    const r = compareRegexes('a*', '(a|b)*');
    expect(r.relation).toBe('left_subset_right');
    expect(r.alphabet).toEqual(['a', 'b']);
    expect(r.rightOnly.witness).toBe('b');
  });

  it('ab|c 与 a(b|c) 互不包含：c 只属于左，ac 只属于右', () => {
    const r = compareRegexes('ab|c', 'a(b|c)');
    expect(r.relation).toBe('incomparable');
    expect(r.leftOnly.witness).toBe('c');
    expect(r.rightOnly.witness).toBe('ac');
  });

  it('互不包含时两个方向都带 exists=true', () => {
    const r = compareRegexes('ab', 'a');
    expect(r.relation).toBe('incomparable');
    expect(r.leftOnly.exists).toBe(true);
    expect(typeof r.leftOnly.witness).toBe('string');
    expect(r.rightOnly.exists).toBe(true);
    expect(typeof r.rightOnly.witness).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 反例放到三台机器上模拟：恰好一边接受一边拒绝
// ---------------------------------------------------------------------------

/** 在一条正则的三台机器上模拟，返回 nfa/dfa/min 三个接受结论 */
function simulateOnAllThree(regex: string, input: string) {
  const p = constructPipeline(regex);
  const trace = simulateAll(
    {
      states: p.nfa.states,
      edges: p.nfa.edges,
      start: p.nfa.start,
      accept: p.nfa.accept,
      alphabet: p.nfa.alphabet,
    },
    p.dfa,
    p.minDfa,
    input,
  );
  return {
    nfa: trace.nfa.accepted,
    dfa: trace.dfa.accepted,
    min: trace.min.accepted,
    agreement: trace.agreement,
  };
}

const HAND_CASES: Array<[string, string, CompareRelation, string | null, string | null]> = [
  ['(a|b)*', '(a*b*)*', 'equivalent', null, null],
  ['a(ba)*', '(ab)*a', 'equivalent', null, null],
  ['(a|b)*abb', '(a|b)*bb', 'left_subset_right', null, 'bb'],
  ['a+', 'a*', 'left_subset_right', null, ''],
  ['a*', '(a|b)*', 'left_subset_right', null, 'b'],
  ['ab|c', 'a(b|c)', 'incomparable', 'c', 'ac'],
];

describe('每条反例在各自三台机器上恰好一边接受一边拒绝', () => {
  for (const [l, r, , lw, rw] of HAND_CASES) {
    for (const [witness, which] of [
      [lw, 'leftOnly'],
      [rw, 'rightOnly'],
    ] as const) {
      if (witness === null) continue;
      it(`${which} 反例 ${JSON.stringify(witness)}：/${l}/ vs /${r}/`, () => {
        const onLeft = simulateOnAllThree(l, witness);
        const onRight = simulateOnAllThree(r, witness);
        // 同一边三台机器必须一致
        expect(onLeft.agreement).toBe(true);
        expect(onRight.agreement).toBe(true);
        if (which === 'leftOnly') {
          // 左接受、右拒绝
          expect(onLeft).toMatchObject({ nfa: true, dfa: true, min: true });
          expect(onRight).toMatchObject({ nfa: false, dfa: false, min: false });
        } else {
          expect(onLeft).toMatchObject({ nfa: false, dfa: false, min: false });
          expect(onRight).toMatchObject({ nfa: true, dfa: true, min: true });
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 长度 6 以内穷举交叉核对
// ---------------------------------------------------------------------------

/** 码点序符号表（与后端 shortlex 枚举顺序一致） */
function sortedSymbols(symbols: Symbol[]): Symbol[] {
  return [...new Set(symbols)].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
}

/** 按 shortlex 序枚举字母表上长度 0..maxLen 的全部串 */
function enumerateShortlex(alphabet: Symbol[], maxLen: number): string[] {
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

function acceptsDfa(dfa: DFA, input: string): boolean {
  return simulateDfa(dfa, input).accepted;
}

const ENUM_PAIRS: Array<[string, string]> = [
  ['(a|b)*', '(a*b*)*'],
  ['a(ba)*', '(ab)*a'],
  ['(a|b)*abb', '(a|b)*bb'],
  ['a+', 'a*'],
  ['a*', '(a|b)*'],
  ['ab|c', 'a(b|c)'],
  ['a', 'a|b'],
  ['ab', 'a'],
  ['(a|b)*', '(a|c)*'],
  ['()', 'a*'],
  ['a?', 'a*'],
  ['a*b*', '(a|b)*'],
  ['(ab)+', '(ab)*'],
  ['a(b|c)', 'ab|ac'],
];

describe('长度 6 以内穷举交叉核对', () => {
  for (const [l, r] of ENUM_PAIRS) {
    it(`/${l}/ vs /${r}/：结论与穷举一致，反例是穷举里排第一的`, () => {
      const cmp = compareRegexes(l, r);
      const lm = buildMinDfa(l);
      const rm = buildMinDfa(r);
      const alphabet = sortedSymbols([...lm.alphabet, ...rm.alphabet]);
      // 只用小字母表的对参与穷举（本用例集全部 ≤3 个符号）
      expect(alphabet.length).toBeLessThanOrEqual(3);

      let expectedLeftWitness: string | null = null;
      let expectedRightWitness: string | null = null;
      for (const s of enumerateShortlex(alphabet, 6)) {
        const la = acceptsDfa(lm.min, s);
        const ra = acceptsDfa(rm.min, s);
        if (la && !ra && expectedLeftWitness === null) expectedLeftWitness = s;
        if (ra && !la && expectedRightWitness === null) expectedRightWitness = s;
        if (expectedLeftWitness !== null && expectedRightWitness !== null) break;
      }

      const expectedRelation: CompareRelation =
        expectedLeftWitness === null
          ? expectedRightWitness === null
            ? 'equivalent'
            : 'left_subset_right'
          : expectedRightWitness === null
            ? 'right_subset_left'
            : 'incomparable';

      expect(cmp.relation, `关系应为 ${expectedRelation}`).toBe(expectedRelation);
      expect(cmp.leftOnly.exists).toBe(expectedLeftWitness !== null);
      expect(cmp.rightOnly.exists).toBe(expectedRightWitness !== null);
      expect(cmp.leftOnly.witness, '左反例不是穷举 shortlex 第一条').toBe(expectedLeftWitness);
      expect(cmp.rightOnly.witness, '右反例不是穷举 shortlex 第一条').toBe(expectedRightWitness);
    });
  }

  it('同一对输入连判多次，反例完全一致（确定性）', () => {
    const first = compareRegexes('ab|c', 'a(b|c)');
    for (let i = 0; i < 5; i++) {
      const again = compareRegexes('ab|c', 'a(b|c)');
      expect(again.leftOnly.witness).toBe(first.leftOnly.witness);
      expect(again.rightOnly.witness).toBe(first.rightOnly.witness);
    }
  });
});

// ---------------------------------------------------------------------------
// 交换左右
// ---------------------------------------------------------------------------

describe('交换左右：方向对调，反例串不变', () => {
  for (const [l, r, rel, lw, rw] of HAND_CASES) {
    it(`/${l}/ ⇄ /${r}/`, () => {
      const forward = compareRegexes(l, r);
      const swapped = compareRegexes(r, l);
      expect(forward.relation).toBe(rel);
      const flipped: CompareRelation =
        rel === 'left_subset_right'
          ? 'right_subset_left'
          : rel === 'right_subset_left'
            ? 'left_subset_right'
            : rel;
      expect(swapped.relation).toBe(flipped);
      // 反例串不变，只是换了方向字段
      expect(swapped.leftOnly.witness).toBe(rw);
      expect(swapped.rightOnly.witness).toBe(lw);
      expect(swapped.leftOnly.exists).toBe(forward.rightOnly.exists);
      expect(swapped.rightOnly.exists).toBe(forward.leftOnly.exists);
      // 空串仍然是空串，不会变成 null
      if (lw === '') expect(swapped.rightOnly.witness).toBe('');
      if (rw === '') expect(swapped.leftOnly.witness).toBe('');
    });
  }
});

// ---------------------------------------------------------------------------
// 逐步数据
// ---------------------------------------------------------------------------

describe('乘积构造逐步数据', () => {
  it('首帧是 init、末帧是 finish，中间帧状态/转移只增不减', () => {
    const r = compareRegexes('a*', '(a|b)*');
    expect(r.steps[0].kind).toBe('init');
    expect(r.steps.at(-1)!.kind).toBe('finish');

    // 从增量字段还原每一帧的累积视图，再做单调性与引用合法性检查
    let edgeCount = 0;
    for (let i = 0; i < r.steps.length; i++) {
      const step = r.steps[i];
      if (i > 0) expect(step.stateCount).toBeGreaterThanOrEqual(r.steps[i - 1].stateCount);
      if (step.newTransition >= 0) {
        expect(step.newTransition).toBe(edgeCount);
        edgeCount++;
      }
      for (let id = 0; id < step.stateCount; id++) {
        expect(id).toBeGreaterThanOrEqual(0);
      }
      // 截至本帧已连的边引用的状态都必须已发现
      for (const t of r.product.transitions.slice(0, edgeCount)) {
        // from/to 是在其被发现的同帧加入的，编号必小于当时的 stateCount
        expect(t.to).toBeLessThan(step.stateCount);
        expect(t.from).toBeLessThan(step.stateCount);
        expect(r.alphabet).toContain(t.symbol);
      }
    }
    // 最终所有组合状态的转移在并集字母表上处处有定义
    expect(r.product.transitions.length).toBe(
      r.product.states.length * r.alphabet.length,
    );
  });

  it('每个组合状态都标了左右分量与四类接受性，且可达性分类齐全', () => {
    const r = compareRegexes('ab|c', 'a(b|c)');
    for (const s of r.product.states) {
      expect(['both', 'left-only', 'right-only', 'neither']).toContain(s.acceptClass);
      expect(s.left).toBeGreaterThanOrEqual(0);
      expect(s.right).toBeGreaterThanOrEqual(0);
      const lAccept = r.left.dfa.accepting.includes(s.left);
      const rAccept = r.right.dfa.accepting.includes(s.right);
      const cls = lAccept && rAccept ? 'both' : lAccept ? 'left-only' : rAccept ? 'right-only' : 'neither';
      expect(s.acceptClass).toBe(cls);
    }
    expect(r.product.accepting.leftOnly).toContain(r.leftOnly.productState!);
    expect(r.product.accepting.rightOnly).toContain(r.rightOnly.productState!);
  });

  it('两侧机器都补出了显式死状态并在图上参与转移', () => {
    const r = compareRegexes('a*', '(a|b)*');
    // 左边只认识 a：补出的死状态在 b 上被用到
    const leftDead = r.left.deadState;
    expect(r.left.dfa.states).toContain(leftDead);
    expect(r.left.dfa.accepting).not.toContain(leftDead);
    expect(
      r.left.dfa.transitions.some((t) => t.from === leftDead && t.to === leftDead),
    ).toBe(true);
    // 乘积里应当出现含左侧死状态分量的组合状态（读到 b 即分岔）
    expect(r.product.states.some((s) => s.left === leftDead)).toBe(true);
    // 右侧 (a|b)* 的最小 DFA 只有一个接受态，不需要死状态也仍然补了一个
    expect(r.right.dfa.states).toContain(r.right.deadState);
  });
});

// ---------------------------------------------------------------------------
// 批量判定
// ---------------------------------------------------------------------------

describe('批量判定', () => {
  it('按提交顺序逐条返回，单条语法错不拖累其他条', () => {
    const students = ['(a*b*)*', '(a', 'a(ba)*', '*xx', '', '(ab)*a'];
    const batch = compareBatch('(a|b)*', students);
    expect(batch.results).toHaveLength(students.length);
    expect(batch.results.map((x) => x.index)).toEqual([0, 1, 2, 3, 4, 5]);

    expect(batch.results[0].ok).toBe(true);
    expect(batch.results[0].relation).toBe('equivalent');

    expect(batch.results[1].ok).toBe(false);
    expect(batch.results[1].error!.position).toBe(0);
    expect(batch.results[1].relation).toBeUndefined();

    // a(ba)* 的语言真包含于 (a|b)*；shortlex 第一反例是空串（左接受 ε、右不接受）
    expect(batch.results[2].ok).toBe(true);
    expect(batch.results[2].relation).toBe('right_subset_left');
    expect(batch.results[2].leftOnly!.witness).toBe('');

    expect(batch.results[3].ok).toBe(false);
    expect(batch.results[3].error).toBeDefined();

    // 空串学生答案（空正则）只是这一条出错
    expect(batch.results[4].ok).toBe(false);

    expect(batch.results[5].ok).toBe(true);
    expect(batch.results[5].relation).toBe('right_subset_left');
  });

  it('30 条可以通过，31 条整批拒绝', () => {
    const thirty = Array.from({ length: MAX_BATCH_STUDENTS }, (_, i) => (i % 2 ? 'a*' : 'b*'));
    const ok = compareBatch('(a|b)*', thirty);
    expect(ok.results).toHaveLength(30);
    expect(ok.results.every((x) => x.ok)).toBe(true);

    expect(() =>
      compareBatch('(a|b)*', [...thirty, 'extra']),
    ).toThrow(/超过上限/);
  });

  it('某条触发组合状态上限只在这一条上报 product_limit', () => {
    const big19 = `(${ 'a'.repeat(19) })*`;
    const big23 = `(${ 'a'.repeat(23) })*`;
    // 19 与 23 互素，乘积有 19*23 = 437 个可达组合状态 > 400
    expect(19 * 23).toBeGreaterThan(MAX_PRODUCT_STATES);
    const batch = compareBatch(big19, ['(a*b*)*', big23]);
    expect(batch.results[0].ok).toBe(true);
    expect(batch.results[1].ok).toBe(false);
    expect(batch.results[1].error!.code).toBe('product_limit');
  });

  it('标准答案语法错以 ParseError 抛出（由路由层翻成整批 400）', () => {
    expect(() => compareBatch('(a', ['a*'])).toThrow(ParseError);
  });
});

// ---------------------------------------------------------------------------
// 规模上限
// ---------------------------------------------------------------------------

describe('组合状态上限', () => {
  it('单条对拍超限时抛 CompareLimitError', () => {
    const big19 = `(${ 'a'.repeat(19) })*`;
    const big23 = `(${ 'a'.repeat(23) })*`;
    try {
      compareRegexes(big19, big23);
      throw new Error('应当抛出 CompareLimitError');
    } catch (err) {
      expect(err).toBeInstanceOf(CompareLimitError);
      expect((err as CompareLimitError).message).toContain(String(MAX_PRODUCT_STATES));
    }
  });

  it('反例（乘积最短路径）一定短于组合状态数，因此必在三机模拟长度上限内', () => {
    // 手算样例 + 几个容易出长反例的互质周期对
    const pairs: Array<[string, string]> = [
      ['(a|b)*', '(a*b*)*'],
      ['a(ba)*', '(ab)*a'],
      ['ab|c', 'a(b|c)'],
      [`(${ 'a'.repeat(17) })*`, `(${ 'a'.repeat(13) })*`],
      [`(${ 'a'.repeat(11) })*b`, `(${ 'a'.repeat(7) })*b`],
    ];
    for (const [l, r] of pairs) {
      const cmp = compareRegexes(l, r);
      for (const ce of [cmp.leftOnly, cmp.rightOnly]) {
        if (!ce.exists) {
          expect(ce.witness).toBeNull();
          continue;
        }
        expect(ce.length).toBeLessThan(cmp.product.states.length);
        expect(ce.length).toBeLessThanOrEqual(MAX_INPUT_LENGTH);
        expect(ce.witness).not.toBeNull();
      }
    }
  });
});

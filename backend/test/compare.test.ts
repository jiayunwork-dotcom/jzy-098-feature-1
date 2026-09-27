/**
 * 答案对拍测试：
 *  1. 老师手算过的样例（关系 + 反例）；
 *  2. 每条反例放到各自三台机器上模拟，恰好一边接受一边拒绝；
 *  3. 小字母表正则对上长度 ≤6 穷举：判定结论与穷举一致，
 *     且反例正是穷举序列里 shortlex（先长度、再逐位码点）排第一的串；
 *  4. 交换左右：包含方向对调、反例串不变；
 *  5. 反例选取的确定性：同一对输入反复调用、以不同方式提交，结果一致。
 */

import { describe, expect, it } from 'vitest';
import { compareRegexes } from '../src/automata/compare';
import { constructPipeline } from '../src/automata/pipeline';
import { simulateAll } from '../src/automata/simulate';
import type { CompareRelation, Symbol } from '../src/automata/types';

interface HandCase {
  left: string;
  right: string;
  relation: CompareRelation;
  /** 左 \\ 右（左接受、右拒绝）的最短反例；null 表示该方向无反例 */
  leftOnly: string | null;
  rightOnly: string | null;
}

const HAND_CASES: HandCase[] = [
  { left: '(a|b)*', right: '(a*b*)*', relation: 'equal', leftOnly: null, rightOnly: null },
  { left: 'a(ba)*', right: '(ab)*a', relation: 'equal', leftOnly: null, rightOnly: null },
  {
    left: '(a|b)*abb',
    right: '(a|b)*bb',
    relation: 'right_subset',
    leftOnly: null,
    rightOnly: 'bb',
  },
  { left: 'a+', right: 'a*', relation: 'right_subset', leftOnly: null, rightOnly: '' },
  { left: 'a*', right: '(a|b)*', relation: 'right_subset', leftOnly: null, rightOnly: 'b' },
  {
    left: 'ab|c',
    right: 'a(b|c)',
    relation: 'incomparable',
    leftOnly: 'c',
    rightOnly: 'ac',
  },
];

describe('答案对拍：手算样例', () => {
  for (const c of HAND_CASES) {
    it(`/${c.left}/ 与 /${c.right}/ => ${c.relation}`, () => {
      const r = compareRegexes(c.left, c.right);
      expect(r.relation).toBe(c.relation);
      expect(r.leftOnlyWitness).toBe(c.leftOnly);
      expect(r.rightOnlyWitness).toBe(c.rightOnly);
    });
  }

  it('空串反例与"该方向没有反例"被严格区分（"" vs null）', () => {
    const r = compareRegexes('a+', 'a*');
    expect(r.rightOnlyWitness).toBe('');
    expect(r.leftOnlyWitness).toBeNull();
  });
});

describe('答案对拍：反例在三台机器上恰好一接受一拒绝', () => {
  for (const c of HAND_CASES) {
    const r = compareRegexes(c.left, c.right);
    const sides = [
      { name: '左\\右', regex: c.left, other: c.right, witness: r.leftOnlyWitness },
      { name: '右\\左', regex: c.right, other: c.left, witness: r.rightOnlyWitness },
    ] as const;
    for (const side of sides) {
      if (side.witness === null) {
        it(`/${c.left}/ vs /${c.right}/ 的 ${side.name} 方向无反例`, () => {
          // 无反例即 null，上面手算样例表已经断言
          expect(side.witness).toBeNull();
        });
        continue;
      }
      it(`/${c.left}/ vs /${c.right}/ 的反例 ${JSON.stringify(side.witness)}（${side.name}）`, () => {
        const w = side.witness;
        const owner = constructPipeline(side.regex);
        const other = constructPipeline(side.other);
        const traceOwner = simulateAll(
          {
            states: owner.nfa.states,
            edges: owner.nfa.edges,
            start: owner.nfa.start,
            accept: owner.nfa.accept,
            alphabet: owner.nfa.alphabet,
          },
          owner.dfa,
          owner.minDfa,
          w,
        );
        const traceOther = simulateAll(
          {
            states: other.nfa.states,
            edges: other.nfa.edges,
            start: other.nfa.start,
            accept: other.nfa.accept,
            alphabet: other.nfa.alphabet,
          },
          other.dfa,
          other.minDfa,
          w,
        );
        // 反例归属方的三台机器一致接受
        expect(traceOwner.nfa.accepted).toBe(true);
        expect(traceOwner.dfa.accepted).toBe(true);
        expect(traceOwner.min.accepted).toBe(true);
        expect(traceOwner.agreement).toBe(true);
        // 另一方的三台机器一致拒绝
        expect(traceOther.nfa.accepted).toBe(false);
        expect(traceOther.dfa.accepted).toBe(false);
        expect(traceOther.min.accepted).toBe(false);
        expect(traceOther.agreement).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 穷举交叉核对
// ---------------------------------------------------------------------------

/** shortlex 顺序枚举：先按长度，同长度按逐位码点字典序 */
function enumerateShortlex(alphabet: Symbol[], maxLen: number): string[] {
  const ordered = [...alphabet].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
  const out: string[] = [''];
  let frontier = [''];
  for (let len = 1; len <= maxLen; len++) {
    const next: string[] = [];
    for (const prefix of frontier) {
      for (const sym of ordered) next.push(prefix + sym);
    }
    out.push(...next);
    frontier = next;
  }
  return out;
}

/** 在枚举序列里找第一条"owner 接受、other 拒绝"的串；没有则 null */
function bruteForceWitness(
  ownerRegex: string,
  otherRegex: string,
  alphabet: Symbol[],
  maxLen: number,
): string | null {
  const owner = constructPipeline(ownerRegex);
  const other = constructPipeline(otherRegex);
  for (const s of enumerateShortlex(alphabet, maxLen)) {
    const a = simulateAll(
      {
        states: owner.nfa.states,
        edges: owner.nfa.edges,
        start: owner.nfa.start,
        accept: owner.nfa.accept,
        alphabet: owner.nfa.alphabet,
      },
      owner.dfa,
      owner.minDfa,
      s,
    ).nfa.accepted;
    const b = simulateAll(
      {
        states: other.nfa.states,
        edges: other.nfa.edges,
        start: other.nfa.start,
        accept: other.nfa.accept,
        alphabet: other.nfa.alphabet,
      },
      other.dfa,
      other.minDfa,
      s,
    ).nfa.accepted;
    if (a && !b) return s;
  }
  return null;
}

/** 用枚举集合（长度 ≤maxLen）近似判定四种关系 */
function bruteForceRelation(
  leftRegex: string,
  rightRegex: string,
  alphabet: Symbol[],
  maxLen: number,
): { relation: CompareRelation; leftOnly: string | null; rightOnly: string | null } {
  const leftOnly = bruteForceWitness(leftRegex, rightRegex, alphabet, maxLen);
  const rightOnly = bruteForceWitness(rightRegex, leftRegex, alphabet, maxLen);
  let relation: CompareRelation;
  if (leftOnly === null && rightOnly === null) relation = 'equal';
  else if (leftOnly !== null && rightOnly === null) relation = 'left_subset';
  else if (leftOnly === null && rightOnly !== null) relation = 'right_subset';
  else relation = 'incomparable';
  return { relation, leftOnly, rightOnly };
}

const PAIR_POOL: Array<[string, string]> = [
  ['a*', 'a*'],
  ['a*', '(a|b)*'],
  ['a+', 'a*'],
  ['(a|b)*', '(a*b*)*'],
  ['a(ba)*', '(ab)*a'],
  ['(a|b)*abb', '(a|b)*bb'],
  ['ab|c', 'a(b|c)'],
  ['ab', 'a*b*'],
  ['(ab)*', '(a|b)*'],
  ['a|b', 'b|a'],
  ['a?b?', 'a*b*'],
  ['(a|b)*a', '(a|b)*b'],
  ['(aa)*', '(aaa)*'],
  ['a*b', '(a|b)*b'],
  ['(ab)*', '(ab|ba)*'],
  ['a(b|c)*', 'a(b|c)'],
  ['(a|b)', 'a'],
  ['()*', 'a?'],
];

describe('答案对拍：长度 6 以内穷举交叉核对', () => {
  for (const [l, r] of PAIR_POOL) {
    it(`/${l}/ vs /${r}/：关系与反例和穷举一致`, () => {
      const cmp = compareRegexes(l, r);
      // 穷举字母表 = 两边字母表并集（本批都是小字母表）
      const alphabet = cmp.alphabet;
      expect(alphabet.length).toBeLessThanOrEqual(3);
      const maxLen = alphabet.length <= 1 ? 8 : 6;
      const brute = bruteForceRelation(l, r, alphabet, maxLen);

      // 这些正则对的差集 witness 都很短（≤ 枚举深度），穷举结论应当与判定完全一致
      expect(cmp.relation, `关系不一致：/${l}/ vs /${r}/`).toBe(brute.relation);
      expect(cmp.leftOnlyWitness).toBe(brute.leftOnly);
      expect(cmp.rightOnlyWitness).toBe(brute.rightOnly);
    });
  }

  it('反例确实是差集中 shortlex 排第一的串（直接在穷举序列里定位）', () => {
    // 抽两对互不包含 / 真包含的代表，手工核对给出的 witness 就是序列首条
    const check = (l: string, r: string, expectLeftOnly: string | null, expectRightOnly: string | null) => {
      const cmp = compareRegexes(l, r);
      expect(cmp.leftOnlyWitness).toBe(expectLeftOnly);
      expect(cmp.rightOnlyWitness).toBe(expectRightOnly);
    };
    check('ab|c', 'a(b|c)', 'c', 'ac');
    check('(a|b)*a', '(a|b)*b', 'a', 'b');
    check('(aa)*', '(aaa)*', 'aa', 'aaa');
    // 字典序按码点：a 先于 b
    check('a', 'b', 'a', 'b');
    // 码点字典序：并列最短时取码点最小的符号
    check('a|b|d', 'c|d', 'a', 'c');
  });
});

describe('答案对拍：交换左右', () => {
  for (const [l, r] of PAIR_POOL) {
    it(`/${l}/ ⇄ /${r}/：方向对调、反例串不变`, () => {
      const a = compareRegexes(l, r);
      const b = compareRegexes(r, l);
      const invert: Record<CompareRelation, CompareRelation> = {
        equal: 'equal',
        left_subset: 'right_subset',
        right_subset: 'left_subset',
        incomparable: 'incomparable',
      };
      expect(b.relation).toBe(invert[a.relation]);
      expect(b.rightOnlyWitness).toBe(a.leftOnlyWitness);
      expect(b.leftOnlyWitness).toBe(a.rightOnlyWitness);
    });
  }
});

describe('答案对拍：确定性与逐步数据', () => {
  it('同一对输入连跑 5 次，反例与乘积状态完全一致', () => {
    const runs = Array.from({ length: 5 }, () => compareRegexes('ab|c', 'a(b|c)'));
    for (const r of runs) {
      expect(r.relation).toBe('incomparable');
      expect(r.leftOnlyWitness).toBe('c');
      expect(r.rightOnlyWitness).toBe('ac');
      expect(JSON.stringify(r.product)).toBe(JSON.stringify(runs[0].product));
    }
  });

  it('逐步帧的累计状态/转移单调增长，末帧等于完整乘积自动机', () => {
    const r = compareRegexes('(a|b)*abb', '(a|b)*bb');
    let prevStates = -1;
    let prevTrans = -1;
    for (const step of r.steps) {
      expect(step.states.length).toBeGreaterThanOrEqual(prevStates);
      expect(step.transitions.length).toBeGreaterThanOrEqual(prevTrans);
      prevStates = step.states.length;
      prevTrans = step.transitions.length;
    }
    const last = r.steps[r.steps.length - 1];
    expect(last.kind).toBe('finish');
    expect(last.states.map((s) => s.id)).toEqual(r.product.states.map((s) => s.id));
    expect(last.transitions).toHaveLength(r.product.transitions.length);
    expect(last.frontier).toEqual([]);
  });

  it('乘积状态四分类与两边接受性一致；初态帧记录空串 witness', () => {
    const r = compareRegexes('a+', 'a*');
    const leftAccept = new Set(r.leftMachine.accepting);
    const rightAccept = new Set(r.rightMachine.accepting);
    for (const s of r.product.states) {
      const la = leftAccept.has(s.left);
      const ra = rightAccept.has(s.right);
      expect(s.category).toBe(la && ra ? 'both' : la ? 'leftOnly' : ra ? 'rightOnly' : 'neither');
    }
    expect(r.product.states[r.product.start].witness).toBe('');
  });

  it('字母表按并集计算：左边没见过的符号也要参与（a* vs (a|b)* 的死状态显式存在）', () => {
    const r = compareRegexes('a*', '(a|b)*');
    expect(r.alphabet).toEqual(['a', 'b']);
    expect(r.leftMachine.alphabet).toEqual(['a', 'b']);
    // 左边补全后必须有显式死状态，且从初态读 b 进入它
    expect(r.leftMachine.deadState).toBeGreaterThanOrEqual(0);
    const start = r.leftMachine.start;
    const bTransition = r.leftMachine.transitions.find(
      (t) => t.from === start && t.symbol === 'b',
    );
    expect(bTransition?.to).toBe(r.leftMachine.deadState);
  });

  it('超过乘积状态上限时明确抛错', () => {
    // 对照：只接受空串的正则乘积只有 1 个可达组合状态，上限 1 也不报错
    expect(() => compareRegexes('()', '()', { maxProductStates: 1 })).not.toThrow();
    // 两条需要 20+ 状态的正则在并集字母表上独立计数，乘积状态数远超 30
    expect(() =>
      compareRegexes(
        'aaaaaaaaaaaaaaaaaaaa',
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        { maxProductStates: 30 },
      ),
    ).toThrow(/组合状态数量超过上限 30/);
  });
});

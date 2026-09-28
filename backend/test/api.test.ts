/**
 * HTTP 接口测试：构造、错误返回、模拟，以及接口层面的三机一致性。
 */

import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('GET /api/health', () => {
  it('返回 ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/examples', () => {
  it('返回内置示例', async () => {
    const res = await request(app).get('/api/examples');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });
});

describe('POST /api/construct', () => {
  it('构造 (a|b)*abb 的完整流水线并给出逐步数据', async () => {
    const res = await request(app).post('/api/construct').send({ regex: '(a|b)*abb' });
    expect(res.status).toBe(200);
    const body = res.body;
    expect(body.nfa.start).toBeDefined();
    expect(body.nfa.edges.some((e: { symbol: string }) => e.symbol === 'ε')).toBe(true);
    expect(body.nfaSteps.length).toBeGreaterThan(3);
    expect(body.dfaSteps[0].kind).toBe('init');
    expect(body.subsetTable.length).toBe(body.dfa.states.length);
    expect(body.hopSteps.at(-1).kind).toBe('final');
    expect(body.minDfa.states.length).toBe(4);
    // 每个最小化状态都记录了合并来源
    expect(Object.keys(body.minDfa.members).length).toBe(4);
  });

  it('非法正则返回 400 与位置', async () => {
    const res = await request(app).post('/api/construct').send({ regex: '(a' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/括号/);
    expect(res.body.position).toBe(0);
  });

  it('缺少 regex 字段返回 400', async () => {
    const res = await request(app).post('/api/construct').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/simulate：接口层面三机一致', () => {
  const cases: Array<[string, string, boolean]> = [
    ['(a|b)*abb', 'ababb', true],
    ['(a|b)*abb', 'ababa', false],
    ['(a|b)*abb', 'abb', true],
    ['(a|b)*abb', '', false],
    ['a*', '', true],
    ['a+', '', false],
    ['colou?r+', 'colourrr', true],
    ['[a-zA-Z_][a-zA-Z0-9_]*', '_x1', true],
  ];

  for (const [regex, input, accepted] of cases) {
    it(`/${regex}/ 对 ${JSON.stringify(input)} => ${accepted}，且三机一致`, async () => {
      const res = await request(app).post('/api/simulate').send({ regex, input });
      expect(res.status).toBe(200);
      expect(res.body.nfa.accepted).toBe(accepted);
      expect(res.body.dfa.accepted).toBe(accepted);
      expect(res.body.min.accepted).toBe(accepted);
      expect(res.body.agreement).toBe(true);
      // 轨迹包含起点帧 + 每字符一帧
      expect(res.body.nfa.steps.length).toBe([...input].length + 1);
    });
  }

  it('非法正则模拟返回 400', async () => {
    const res = await request(app).post('/api/simulate').send({ regex: '(*)', input: 'a' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/compare：单条答案对拍', () => {
  it('等价正则：relation=equivalent，两个方向都无反例', async () => {
    const res = await request(app).post('/api/compare').send({ left: '(a|b)*', right: '(a*b*)*' });
    expect(res.status).toBe(200);
    expect(res.body.relation).toBe('equivalent');
    expect(res.body.leftOnly).toMatchObject({ exists: false, witness: null });
    expect(res.body.rightOnly).toMatchObject({ exists: false, witness: null });
    expect(res.body.alphabet).toEqual(['a', 'b']);
    expect(res.body.steps[0].kind).toBe('init');
    expect(res.body.steps.at(-1).kind).toBe('finish');
  });

  it('真包含：返回该方向反例', async () => {
    const res = await request(app)
      .post('/api/compare')
      .send({ left: '(a|b)*abb', right: '(a|b)*bb' });
    expect(res.status).toBe(200);
    expect(res.body.relation).toBe('left_subset_right');
    expect(res.body.rightOnly).toMatchObject({ exists: true, witness: 'bb' });
  });

  it('空串反例返回 witness="" 而不是 null', async () => {
    const res = await request(app).post('/api/compare').send({ left: 'a+', right: 'a*' });
    expect(res.status).toBe(200);
    expect(res.body.rightOnly.witness).toBe('');
    expect(res.body.rightOnly.length).toBe(0);
    expect(res.body.rightOnly.exists).toBe(true);
  });

  it('字母表取并集：a* vs (a|b)* 反例 b，且两侧机器都显式补了死状态', async () => {
    const res = await request(app).post('/api/compare').send({ left: 'a*', right: '(a|b)*' });
    expect(res.status).toBe(200);
    expect(res.body.rightOnly.witness).toBe('b');
    // 左侧完整 DFA 的状态数 = 最小 DFA 2 个（含补出的死状态）
    expect(res.body.left.dfa.states.length).toBe(2);
    expect(res.body.left.dfa.transitions.length).toBe(
      res.body.left.dfa.states.length * 2,
    );
  });

  it('左边语法错：400 且带 side=left 与列号', async () => {
    const res = await request(app).post('/api/compare').send({ left: '(a', right: 'a*' });
    expect(res.status).toBe(400);
    expect(res.body.side).toBe('left');
    expect(res.body.position).toBe(0);
  });

  it('右边语法错：400 且带 side=right 与列号', async () => {
    const res = await request(app)
      .post('/api/compare')
      .send({ left: 'a*', right: 'a|' });
    expect(res.status).toBe(400);
    expect(res.body.side).toBe('right');
    expect(typeof res.body.position).toBe('number');
  });

  it('两边都语法错：优先报左边', async () => {
    const res = await request(app).post('/api/compare').send({ left: '(', right: ')' });
    expect(res.status).toBe(400);
    expect(res.body.side).toBe('left');
  });

  it('缺少字段返回 400', async () => {
    const res = await request(app).post('/api/compare').send({ left: 'a*' });
    expect(res.status).toBe(400);
  });

  it('组合状态超上限返回 422', async () => {
    const r19 = `(${ 'a'.repeat(19) })*`;
    const r23 = `(${ 'a'.repeat(23) })*`;
    const res = await request(app).post('/api/compare').send({ left: r19, right: r23 });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/组合状态/);
  });
});

describe('POST /api/compare-batch：批量判定', () => {
  it('一次返回多条结论，顺序与提交一致', async () => {
    const res = await request(app)
      .post('/api/compare-batch')
      .send({ reference: '(a|b)*', students: ['(a*b*)*', 'a*', 'c+'] });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(3);
    expect(res.body.results[0].relation).toBe('equivalent');
    expect(res.body.results[1].relation).toBe('right_subset_left');
    expect(res.body.results[2].ok).toBe(true);
    expect(res.body.results.map((x: { index: number }) => x.index)).toEqual([0, 1, 2]);
  });

  it('单条语法错只拖累这一条', async () => {
    const res = await request(app)
      .post('/api/compare-batch')
      .send({ reference: 'a*', students: ['a+', '(', 'a?', '**'] });
    expect(res.status).toBe(200);
    expect(res.body.results[0].ok).toBe(true);
    expect(res.body.results[1].ok).toBe(false);
    expect(typeof res.body.results[1].error.position).toBe('number');
    expect(res.body.results[2].ok).toBe(true);
    expect(res.body.results[3].ok).toBe(false);
  });

  it('单条触发组合上限只在这一条上报 code=product_limit', async () => {
    const r19 = `(${ 'a'.repeat(19) })*`;
    const r23 = `(${ 'a'.repeat(23) })*`;
    const res = await request(app)
      .post('/api/compare-batch')
      .send({ reference: r19, students: ['a*', r23] });
    expect(res.status).toBe(200);
    expect(res.body.results[0].ok).toBe(true);
    expect(res.body.results[1].ok).toBe(false);
    expect(res.body.results[1].error.code).toBe('product_limit');
  });

  it('超过 30 条：整个请求 400', async () => {
    const students = Array.from({ length: 31 }, () => 'a*');
    const res = await request(app)
      .post('/api/compare-batch')
      .send({ reference: 'a*', students });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/30/);
  });

  it('恰好 30 条：通过', async () => {
    const students = Array.from({ length: 30 }, () => 'a*');
    const res = await request(app)
      .post('/api/compare-batch')
      .send({ reference: 'a*', students });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(30);
  });

  it('标准答案语法错：整批 400 并带位置', async () => {
    const res = await request(app)
      .post('/api/compare-batch')
      .send({ reference: '(a', students: ['a*'] });
    expect(res.status).toBe(400);
    expect(res.body.position).toBe(0);
  });

  it('students 不是数组：400', async () => {
    const res = await request(app)
      .post('/api/compare-batch')
      .send({ reference: 'a*', students: 'a*' });
    expect(res.status).toBe(400);
  });

  it('students 里有非字符串：400', async () => {
    const res = await request(app)
      .post('/api/compare-batch')
      .send({ reference: 'a*', students: ['a*', 1] });
    expect(res.status).toBe(400);
  });
});

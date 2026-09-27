/**
 * 答案对拍 HTTP 接口测试：/api/compare 与 /api/compare-batch。
 */

import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('POST /api/compare', () => {
  it('等价：(a|b)* 与 (a*b*)*', async () => {
    const res = await request(app).post('/api/compare').send({ left: '(a|b)*', right: '(a*b*)*' });
    expect(res.status).toBe(200);
    expect(res.body.relation).toBe('equal');
    expect(res.body.leftOnlyWitness).toBeNull();
    expect(res.body.rightOnlyWitness).toBeNull();
    expect(res.body.alphabet).toEqual(['a', 'b']);
    expect(res.body.product.states.length).toBe(1);
    expect(res.body.steps.at(-1).kind).toBe('finish');
  });

  it('真包含 + 空串反例：a+ 与 a*（反例是 "" 而不是 null）', async () => {
    const res = await request(app).post('/api/compare').send({ left: 'a+', right: 'a*' });
    expect(res.status).toBe(200);
    expect(res.body.relation).toBe('right_subset');
    expect(res.body.leftOnlyWitness).toBeNull();
    expect(res.body.rightOnlyWitness).toBe('');
  });

  it('真包含：(a|b)*abb 与 (a|b)*bb，反例 bb', async () => {
    const res = await request(app)
      .post('/api/compare')
      .send({ left: '(a|b)*abb', right: '(a|b)*bb' });
    expect(res.status).toBe(200);
    expect(res.body.relation).toBe('right_subset');
    expect(res.body.rightOnlyWitness).toBe('bb');
  });

  it('互不包含：ab|c 与 a(b|c)，两个方向各给一条', async () => {
    const res = await request(app).post('/api/compare').send({ left: 'ab|c', right: 'a(b|c)' });
    expect(res.status).toBe(200);
    expect(res.body.relation).toBe('incomparable');
    expect(res.body.leftOnlyWitness).toBe('c');
    expect(res.body.rightOnlyWitness).toBe('ac');
  });

  it('字母表并集：a* 与 (a|b)*，左机显式补出死状态', async () => {
    const res = await request(app).post('/api/compare').send({ left: 'a*', right: '(a|b)*' });
    expect(res.status).toBe(200);
    expect(res.body.alphabet).toEqual(['a', 'b']);
    expect(res.body.leftMachine.alphabet).toEqual(['a', 'b']);
    expect(res.body.leftMachine.deadState).toBeGreaterThanOrEqual(0);
    // 每个状态在并集字母表的每个符号上都有转移（完整 DFA）
    for (const s of res.body.leftMachine.states) {
      for (const sym of res.body.alphabet) {
        const hit = res.body.leftMachine.transitions.some(
          (t: { from: number; symbol: string }) => t.from === s && t.symbol === sym,
        );
        expect(hit).toBe(true);
      }
    }
  });

  it('左边语法错误：400，side=left，带列号', async () => {
    const res = await request(app).post('/api/compare').send({ left: '(a', right: 'a*' });
    expect(res.status).toBe(400);
    expect(res.body.side).toBe('left');
    expect(res.body.position).toBe(0);
    expect(res.body.error).toMatch(/括号/);
  });

  it('右边语法错误：400，side=right，带列号', async () => {
    const res = await request(app).post('/api/compare').send({ left: 'a*', right: '+a' });
    expect(res.status).toBe(400);
    expect(res.body.side).toBe('right');
    expect(res.body.position).toBe(0);
  });

  it('两边都错时归到左边（先解析左边）', async () => {
    const res = await request(app).post('/api/compare').send({ left: '(', right: ')' });
    expect(res.status).toBe(400);
    expect(res.body.side).toBe('left');
  });

  it('缺字段返回 400', async () => {
    const res = await request(app).post('/api/compare').send({ left: 'a*' });
    expect(res.status).toBe(400);
  });

  it('乘积状态超限时 422 明确报错，不挂起', async () => {
    // 两条分别用 DFA 计数 a 个数 mod 20、b 个数 mod 21 的正则，
    // 乘积可达 20×21 = 420 个组合状态，超过 400 上限；单侧 DFA 仍很小。
    const modA20 = `(${ 'b*a'.repeat(20) })*b*`;
    const modB21 = `(${ 'a*b'.repeat(21) })*a*`;
    const res = await request(app)
      .post('/api/compare')
      .send({ left: modA20, right: modB21 });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/组合状态数量超过上限/);
  });
});

describe('POST /api/compare-batch', () => {
  it('一次提交多条，按提交顺序逐条返回结论与反例', async () => {
    const res = await request(app)
      .post('/api/compare-batch')
      .send({
        left: '(a|b)*',
        answers: ['(a*b*)*', 'a(ba)*', 'a*', 'ab|c'],
      });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(4);
    expect(res.body.results.map((r: { index: number }) => r.index)).toEqual([0, 1, 2, 3]);
    expect(res.body.results[0].relation).toBe('equal');
    // (a|b)* 包含 a*：学生答案 a* 真包含于标准答案
    expect(res.body.results[2].relation).toBe('left_subset');
    expect(res.body.results[2].leftOnlyWitness).toBe('b');
    expect(res.body.results[2].rightOnlyWitness).toBeNull();
    // 空串反例照常携带：标准答案 a* ⊃ 学生答案 a+，左 \\ 右 反例是空串
    const empty = await request(app)
      .post('/api/compare-batch')
      .send({ left: 'a*', answers: ['a+'] });
    expect(empty.body.results[0].relation).toBe('left_subset');
    expect(empty.body.results[0].leftOnlyWitness).toBe('');
  });

  it('单条语法错误只拖累它自己：带错误原因、位置与 side，其余照常出结论', async () => {
    const res = await request(app)
      .post('/api/compare-batch')
      .send({
        left: '(a|b)*',
        answers: ['(a*b*)*', '(a', 'a?', '*oops'],
      });
    expect(res.status).toBe(200);
    const [ok1, bad1, ok2, bad2] = res.body.results;
    expect(ok1.relation).toBe('equal');
    expect(bad1.error).toMatch(/括号/);
    expect(bad1.position).toBe(0);
    expect(bad1.side).toBe('right');
    expect(bad1.relation).toBeUndefined();
    expect(ok2.relation).toBe('left_subset'); // (a|b)* 真包含 a?
    expect(bad2.error).toBeTruthy();
    expect(bad2.side).toBe('right');
    expect(typeof bad2.position).toBe('number');
  });

  it('标准答案出错：每条都带 side=left 的错误', async () => {
    const res = await request(app)
      .post('/api/compare-batch')
      .send({ left: '(', answers: ['a*', 'b*'] });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    for (const item of res.body.results) {
      expect(item.side).toBe('left');
      expect(item.error).toMatch(/标准答案有误/);
      expect(item.relation).toBeUndefined();
    }
  });

  it('超过 30 条整个请求拒绝（400）', async () => {
    const answers = Array.from({ length: 31 }, (_, i) => `a${'*'.repeat(i)}`);
    const res = await request(app)
      .post('/api/compare-batch')
      .send({ left: 'a*', answers });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/最多.*30 条/);
  });

  it('正好 30 条可以通过', async () => {
    const answers = Array.from({ length: 30 }, () => 'a*');
    const res = await request(app)
      .post('/api/compare-batch')
      .send({ left: 'a*', answers });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(30);
  });

  it('answers 为空 / 缺字段 / 元素非字符串均 400', async () => {
    const r1 = await request(app).post('/api/compare-batch').send({ left: 'a*', answers: [] });
    expect(r1.status).toBe(400);
    const r2 = await request(app).post('/api/compare-batch').send({ left: 'a*' });
    expect(r2.status).toBe(400);
    const r3 = await request(app)
      .post('/api/compare-batch')
      .send({ left: 'a*', answers: ['a*', 42] });
    expect(r3.status).toBe(400);
  });
});

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

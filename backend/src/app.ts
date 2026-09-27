/**
 * HTTP 接口层（Express）。只做参数校验、错误包装与静态托管，
 * 所有构造/判定逻辑都在 automata/* 与 parser/* 模块里。
 */

import express, { Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { ParseError } from './parser/regexParser';
import { constructPipeline } from './automata/pipeline';
import { simulateAll, MAX_INPUT_LENGTH } from './automata/simulate';
import { EXAMPLES } from './automata/examples';
import type { ApiError, ConstructResult, SimulateResult } from './automata/types';

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/examples', (_req: Request, res: Response) => {
    res.json(EXAMPLES);
  });

  /** 全流水线：正则 → NFA → DFA → 最小化 DFA（含全部逐步数据） */
  app.post('/api/construct', (req: Request, res: Response<ConstructResult | ApiError>) => {
    const regex = typeof req.body?.regex === 'string' ? req.body.regex : null;
    if (regex === null) {
      res.status(400).json({ error: '请求体缺少 regex 字段（需要一个字符串）' });
      return;
    }
    if (regex.length > 500) {
      res.status(400).json({ error: '正则过长（最多 500 个字符）', position: 500 });
      return;
    }
    try {
      const result = constructPipeline(regex);
      res.json(result);
    } catch (err) {
      if (err instanceof ParseError) {
        res.status(400).json({ error: err.message, position: err.position });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(422).json({ error: `构造失败：${message}` });
    }
  });

  /** 在已经构造好的三台机器上模拟测试串。
   *  为保证无状态部署，这里每次请求都重新构造（教学规模下开销可忽略）。 */
  app.post('/api/simulate', (req: Request, res: Response<SimulateResult | ApiError>) => {
    const regex = typeof req.body?.regex === 'string' ? req.body.regex : null;
    const input = typeof req.body?.input === 'string' ? req.body.input : null;
    if (regex === null || input === null) {
      res.status(400).json({ error: '请求体需要字符串字段 regex 与 input' });
      return;
    }
    if ([...input].length > MAX_INPUT_LENGTH) {
      res.status(400).json({ error: `测试串过长（最多 ${MAX_INPUT_LENGTH} 个字符）` });
      return;
    }
    try {
      const pipeline = constructPipeline(regex);
      const trace = simulateAll(
        {
          states: pipeline.nfa.states,
          edges: pipeline.nfa.edges,
          start: pipeline.nfa.start,
          accept: pipeline.nfa.accept,
          alphabet: pipeline.nfa.alphabet,
        },
        pipeline.dfa,
        pipeline.minDfa,
        input,
      );
      res.json(trace);
    } catch (err) {
      if (err instanceof ParseError) {
        res.status(400).json({ error: err.message, position: err.position });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(422).json({ error: `模拟失败：${message}` });
    }
  });

  // ---- 生产模式：托管前端构建产物 ----
  const staticDir = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^(?!\/api\/).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  return app;
}

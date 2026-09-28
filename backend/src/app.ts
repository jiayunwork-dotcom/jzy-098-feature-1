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
import {
  buildMinDfa,
  compareBatch,
  compareRegexes,
  CompareLimitError,
  MAX_BATCH_STUDENTS,
} from './automata/compare';
import { EXAMPLES } from './automata/examples';
import type {
  ApiError,
  BatchCompareResult,
  CompareResult,
  ConstructResult,
  SimulateResult,
} from './automata/types';

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

  // ---- 答案对拍 ----

  /** 单条对拍：{ left, right } → 四种关系之一 + 各方向最短反例 + 乘积逐步数据。
   *  语法错要说明是哪一边、第几列，前端据此标红对应输入框。 */
  app.post('/api/compare', (req: Request, res: Response<CompareResult | ApiError>) => {
    const left = typeof req.body?.left === 'string' ? req.body.left : null;
    const right = typeof req.body?.right === 'string' ? req.body.right : null;
    if (left === null || right === null) {
      res.status(400).json({ error: '请求体需要字符串字段 left 与 right' });
      return;
    }
    try {
      res.json(compareRegexes(left, right));
    } catch (err) {
      if (err instanceof ParseError) {
        // 正常路径已经成功构造过两侧；出错时重新单独解析，确定报错来自哪一边。
        // 两边都非法时优先报左边（前端先标左框，改完再报右边）。
        let side: 'left' | 'right' = 'right';
        let positioned: ParseError = err;
        try {
          buildMinDfa(left);
        } catch (eLeft) {
          side = 'left';
          if (eLeft instanceof ParseError) positioned = eLeft;
        }
        res.status(400).json({
          error: `${side === 'left' ? '左' : '右'}边正则有误：${positioned.message}`,
          position: positioned.position,
          side,
        });
        return;
      }
      if (err instanceof CompareLimitError) {
        res.status(422).json({ error: err.message, code: err.code });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(422).json({ error: `对拍失败：${message}` });
    }
  });

  /** 批量对拍：{ reference, students: string[最多30] }。
   *  超过 30 条整个请求拒绝；单条学生答案语法/规模出错只拖累它自己那一条。 */
  app.post(
    '/api/compare-batch',
    (req: Request, res: Response<BatchCompareResult | ApiError>) => {
      const reference =
        typeof req.body?.reference === 'string' ? req.body.reference : null;
      const students = Array.isArray(req.body?.students) ? req.body.students : null;
      if (reference === null || students === null) {
        res
          .status(400)
          .json({ error: '请求体需要字符串字段 reference 与字符串数组字段 students' });
        return;
      }
      if (students.length > MAX_BATCH_STUDENTS) {
        res.status(400).json({
          error: `学生答案数量超过上限（最多 ${MAX_BATCH_STUDENTS} 条，收到 ${students.length} 条），整个请求被拒绝`,
        });
        return;
      }
      if (students.some((s: unknown) => typeof s !== 'string')) {
        res.status(400).json({ error: 'students 数组的每一项都必须是字符串' });
        return;
      }
      // 标准答案非法：整个请求 400（带上位置，前端标红标准答案框）
      try {
        buildMinDfa(reference);
      } catch (err) {
        if (err instanceof ParseError) {
          res
            .status(400)
            .json({ error: `标准答案正则有误：${err.message}`, position: err.position });
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        res.status(422).json({ error: `标准答案构造失败：${message}` });
        return;
      }
      try {
        res.json(compareBatch(reference, students as string[]));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(422).json({ error: `批量对拍失败：${message}` });
      }
    },
  );

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

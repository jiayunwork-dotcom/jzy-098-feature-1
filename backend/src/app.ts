/**
 * HTTP 接口层（Express）。只做参数校验、错误包装与静态托管，
 * 所有构造/判定逻辑都在 automata/* 与 parser/* 模块里。
 */

import express, { Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { ParseError, parseRegex } from './parser/regexParser';
import { constructPipeline } from './automata/pipeline';
import { simulateAll, MAX_INPUT_LENGTH } from './automata/simulate';
import { compareRegexes } from './automata/compare';
import { EXAMPLES } from './automata/examples';
import type {
  ApiError,
  CompareBatchItem,
  CompareBatchResult,
  ConstructResult,
  SimulateResult,
} from './automata/types';

/**
 * 判定对拍时的 ParseError 来自哪一边：compareRegexes 保证先解析左边再解析右边，
 * 这里直接再单独解析一次左边即可确定（教学规模下开销可忽略）。
 */
function compareParseSide(leftRegex: string): 'left' | 'right' {
  try {
    parseRegex(leftRegex);
    return 'right';
  } catch (err) {
    if (err instanceof ParseError) return 'left';
    throw err;
  }
}

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

  /** 答案对拍：判定两条正则的语言关系，给出最短反例与乘积自动机逐步数据 */
  app.post('/api/compare', (req: Request, res: Response) => {
    const leftRegex =
      typeof req.body?.left === 'string' ? req.body.left : null;
    const rightRegex =
      typeof req.body?.right === 'string' ? req.body.right : null;
    if (leftRegex === null || rightRegex === null) {
      res.status(400).json({ error: '请求体需要字符串字段 left（标准答案）与 right（学生答案）' });
      return;
    }
    try {
      res.json(compareRegexes(leftRegex, rightRegex));
    } catch (err) {
      // compareRegexes 内部先解析左边再解析右边，据此标注出错侧
      if (err instanceof ParseError) {
        const side = compareParseSide(leftRegex);
        res.status(400).json({
          error: err.message,
          position: err.position,
          side,
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(422).json({ error: `对拍失败：${message}` });
    }
  });

  /** 批量对拍：一条标准答案配最多 30 条学生答案，逐条给结论；单条出错不拖累其他条 */
  app.post('/api/compare-batch', (req: Request, res: Response) => {
    const leftRegex =
      typeof req.body?.left === 'string' ? req.body.left : null;
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : null;
    if (leftRegex === null || answers === null) {
      res
        .status(400)
        .json({ error: '请求体需要字符串字段 left 与数组字段 answers（学生答案列表）' });
      return;
    }
    if (answers.length === 0) {
      res.status(400).json({ error: 'answers 不能为空：至少提交一条学生答案' });
      return;
    }
    if (answers.length > 30) {
      res.status(400).json({ error: `学生答案一次最多提交 30 条（本次 ${answers.length} 条），整个请求已拒绝` });
      return;
    }
    if (!answers.every((a: unknown) => typeof a === 'string')) {
      res.status(400).json({ error: 'answers 的每一项都必须是字符串' });
      return;
    }

    // 标准答案只解析/构造一次：它出错时所有条目的判定都失去基准，整请求报错
    let leftError: { error: string; position: number } | null = null;
    try {
      compareRegexes(leftRegex, leftRegex);
    } catch (err) {
      if (err instanceof ParseError) {
        leftError = { error: err.message, position: err.position };
      } else {
        const message = err instanceof Error ? err.message : String(err);
        res.status(422).json({ error: `对拍失败：${message}` });
        return;
      }
    }

    const results: CompareBatchItem[] = answers.map((answer: string, i: number) => {
      if (leftError) {
        return {
          index: i,
          error: `标准答案有误：${leftError.error}`,
          position: leftError.position,
          side: 'left' as const,
        };
      }
      try {
        const r = compareRegexes(leftRegex, answer);
        return {
          index: i,
          relation: r.relation,
          leftOnlyWitness: r.leftOnlyWitness,
          rightOnlyWitness: r.rightOnlyWitness,
        };
      } catch (err) {
        if (err instanceof ParseError) {
          return {
            index: i,
            error: err.message,
            position: err.position,
            side: 'right' as const,
          };
        }
        const message = err instanceof Error ? err.message : String(err);
        return { index: i, error: message, side: 'right' as const };
      }
    });

    const body: CompareBatchResult = { leftRegex, results };
    res.json(body);
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

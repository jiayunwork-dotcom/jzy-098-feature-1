/** 极简 API 客户端：所有构造/模拟/判定都在后端完成，前端只发请求、拿结构化结果。 */

import type {
  ApiErrorDTO,
  BatchCompareResultDTO,
  CompareResultDTO,
  ConstructResultDTO,
  ExampleRegexDTO,
  SimulateResultDTO,
} from './types';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) {
    const err = payload as ApiErrorDTO;
    const error = new Error(err.error || `请求失败（${res.status}）`) as Error & {
      position?: number;
      side?: 'left' | 'right';
      code?: string;
    };
    error.position = err.position;
    error.side = err.side;
    error.code = err.code;
    throw error;
  }
  return payload as T;
}

export function fetchExamples(): Promise<ExampleRegexDTO[]> {
  return fetch('/api/examples').then((r) => r.json());
}

export function constructRegex(regex: string): Promise<ConstructResultDTO> {
  return postJson<ConstructResultDTO>('/api/construct', { regex });
}

export function simulateRegex(regex: string, input: string): Promise<SimulateResultDTO> {
  return postJson<SimulateResultDTO>('/api/simulate', { regex, input });
}

export function compareRegexes(left: string, right: string): Promise<CompareResultDTO> {
  return postJson<CompareResultDTO>('/api/compare', { left, right });
}

export function compareBatch(
  reference: string,
  students: string[],
): Promise<BatchCompareResultDTO> {
  return postJson<BatchCompareResultDTO>('/api/compare-batch', { reference, students });
}

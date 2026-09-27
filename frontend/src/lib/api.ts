/** 极简 API 客户端：所有构造/模拟都在后端完成，前端只发请求、拿结构化结果。 */

import type {
  ApiErrorDTO,
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
    const error = new Error(err.error || `请求失败（${res.status}）`);
    (error as Error & { position?: number }).position = err.position;
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

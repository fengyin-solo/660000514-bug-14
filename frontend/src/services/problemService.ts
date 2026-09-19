import { request } from './api';
import type { Problem, CreateProblemRequest, UpdateProblemRequest } from '../types';
import {
  mockGetProblems,
  mockGetProblemById,
  mockCreateProblem,
  mockUpdateProblem,
  mockDeleteProblem,
} from './mockProblemService';

export interface ProblemListParams {
  difficulty?: string;
  tag?: string;
}

/**
 * 是否启用本地 Mock 数据。
 * 只能通过显式开启（开发/演示时没有后端），绝不能因为一次临时网络错误
 * 就永久切换——否则短时断网后界面会静默展示 localStorage 里的旧数据，
 * 用户无法区分"没有数据"还是"加载失败"。
 */
let useMockFallback = false;

export const setUseMockFallback = (value: boolean) => {
  useMockFallback = value;
  if (value) {
    console.info('已显式切换到 Mock 数据模式。数据将保存在浏览器本地存储中。');
  }
};

export const isUsingMockData = () => useMockFallback;

export async function getProblems(params?: ProblemListParams): Promise<Problem[]> {
  if (useMockFallback) {
    return mockGetProblems(params);
  }
  const queryParams = new URLSearchParams();
  if (params?.difficulty) {
    queryParams.append('difficulty', params.difficulty);
  }
  if (params?.tag) {
    queryParams.append('tag', params.tag);
  }
  const queryString = queryParams.toString();
  const response = await request<any[]>(`/problems${queryString ? `?${queryString}` : ''}`);
  return parseProblemListResponse(response);
}

export async function getProblemById(id: string): Promise<Problem> {
  if (useMockFallback) {
    return mockGetProblemById(id);
  }
  const response = await request<any>(`/problems/${id}`);
  return parseProblemResponse(response);
}

export async function createProblem(data: CreateProblemRequest): Promise<Problem> {
  if (useMockFallback) {
    return mockCreateProblem(data);
  }
  const payload = {
    ...data,
    examples: JSON.stringify(data.examples),
    testCases: JSON.stringify(data.testCases),
    tags: JSON.stringify(data.tags),
  };
  const response = await request<any>('/problems', {
    method: 'POST',
    body: payload,
  });
  return parseProblemResponse(response);
}

export async function updateProblem(id: string, data: UpdateProblemRequest): Promise<Problem> {
  if (useMockFallback) {
    return mockUpdateProblem(id, data);
  }
  const payload: Record<string, any> = { ...data };
  if (data.examples) {
    payload.examples = JSON.stringify(data.examples);
  }
  if (data.testCases) {
    payload.testCases = JSON.stringify(data.testCases);
  }
  if (data.tags) {
    payload.tags = JSON.stringify(data.tags);
  }
  delete payload.id;
  const response = await request<any>(`/problems/${id}`, {
    method: 'PUT',
    body: payload,
  });
  return parseProblemResponse(response);
}

export async function deleteProblem(id: string): Promise<void> {
  if (useMockFallback) {
    return mockDeleteProblem(id);
  }
  return request<void>(`/problems/${id}`, {
    method: 'DELETE',
  });
}

export function parseProblemResponse(problem: any): Problem {
  return {
    ...problem,
    examples: problem.examples ? JSON.parse(problem.examples) : [],
    testCases: problem.testCases ? JSON.parse(problem.testCases) : [],
    tags: problem.tags ? JSON.parse(problem.tags) : [],
  };
}

export function parseProblemListResponse(problems: any[]): Problem[] {
  return problems.map(parseProblemResponse);
}

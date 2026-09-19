export const BASE_URL = 'http://localhost:8080/api';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: any;
}

export interface ApiError extends Error {
  status?: number;
  isNetworkError: boolean;
  url: string;
}

const NETWORK_ERROR_MESSAGES = [
  'Failed to fetch',
  'NetworkError',
  'ECONNREFUSED',
  'Load failed',
  'Network request failed',
];

export const isNetworkError = (error: unknown): boolean => {
  if (!error) return false;
  const err = error as { message?: string; status?: number; isNetworkError?: boolean };
  if (err.isNetworkError) return true;
  if (err.status === 0) return true;
  return !!err.message && NETWORK_ERROR_MESSAGES.some((m) => err.message!.includes(m));
};

const describeHttpError = (status: number): string => {
  switch (status) {
    case 400: return '请求参数有误（400）';
    case 401: return '未授权或邀请凭证无效（401）';
    case 403: return '没有访问权限（403）';
    case 404: return '资源不存在（404）';
    case 409: return '状态冲突，操作未生效（409）';
    case 500: return '服务器内部错误（500）';
    case 502: return '网关错误（502）';
    case 503: return '服务暂不可用（503）';
    default: return `请求失败（HTTP ${status}）`;
  }
};

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  const config: RequestInit = {
    ...options,
    headers,
  };

  if (options.body !== undefined && options.body !== null) {
    config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${url}`, config);
  } catch (err) {
    // 断网、DNS 失败、后端未启动等：fetch 直接 reject，必须显式暴露给调用方
    const error = new Error(
      '无法连接服务器，请检查网络或后端服务是否正常后重试',
    ) as ApiError;
    error.isNetworkError = true;
    error.url = url;
    throw error;
  }

  if (!response.ok) {
    let detail = '';
    try {
      const text = await response.text();
      detail = text ? `：${text.slice(0, 200)}` : '';
    } catch {
      // 忽略响应体解析失败
    }
    const error = new Error(`${describeHttpError(response.status)}${detail}`) as ApiError;
    error.status = response.status;
    error.isNetworkError = false;
    error.url = url;
    throw error;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export class ApiError extends Error {
  kind: 'network' | 'timeout' | 'http' | 'configuration' | 'protocol';
  status?: number;
  constructor(message: string, kind: ApiError['kind'], status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}
export async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    timeoutMs?: number;
    fetcher?: typeof fetch;
    configurationError?: string;
  } = {},
): Promise<T> {
  if (options.configurationError || !baseUrl)
    throw new ApiError(
      options.configurationError || 'Chưa cấu hình URL API trong apps/mobile/.env.',
      'configuration',
    );
  const controller = new AbortController(),
    timeoutMs = options.timeoutMs ?? 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetcher || fetch)(`${baseUrl}/api${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const isJson = response.headers.get('content-type')?.includes('application/json');
    if (!isJson)
      throw new ApiError(
        `Máy chủ ${baseUrl} trả HTTP ${response.status} không phải JSON. Kiểm tra URL có trỏ đúng API cổng 4000, không phải Metro 8081.`,
        'protocol',
        response.status,
      );
    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new ApiError(
        'API trả JSON không hợp lệ. Kiểm tra log máy chủ.',
        'protocol',
        response.status,
      );
    }
    if (!response.ok)
      throw new ApiError(
        typeof data?.error === 'string' ? data.error : `Lỗi HTTP ${response.status}`,
        'http',
        response.status,
      );
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        `API ${baseUrl} chưa phản hồi sau ${Math.round(timeoutMs / 1000)} giây. Giữ API chạy và mở ${baseUrl}/api/health trên đúng thiết bị để kiểm tra.`,
        'timeout',
      );
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof TypeError || /fetch|network|cancel|abort|failed to connect/i.test(message))
      throw new ApiError(
        `Không kết nối được API ${baseUrl}. Mở ${baseUrl}/api/health trên thiết bị; kiểm tra API, mạng và apps/mobile/.env.`,
        'network',
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

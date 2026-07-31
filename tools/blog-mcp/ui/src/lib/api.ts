const CSRF_HEADER = 'X-Blog-Mcp-Csrf';

export interface Envelope<T = unknown> {
  ok: boolean;
  kind?: string;
  summary?: string;
  /** Present on routes that respond with a plain {error} shape (login, logout, malformed-request 4xxs) rather than the ToolResult envelope. */
  error?: string;
  data?: T;
}

/**
 * Same contract as the vanilla UI's api() helper: adds the CSRF header,
 * redirects to /login on 401, throws on any other non-ok response so
 * callers can just await + catch. Ported as-is, not redesigned.
 */
export async function api<T = unknown>(path: string, options?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<Envelope<T>> {
  const headers: Record<string, string> = { [CSRF_HEADER]: '1' };
  let requestBody: string | undefined;
  if (options?.method === 'POST') {
    headers['content-type'] = 'application/json';
    requestBody = JSON.stringify(options.body ?? {});
  }

  const res = await fetch(path, { method: options?.method, headers, body: requestBody });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Not authenticated');
  }
  const body = (await res.json()) as Envelope<T>;
  if (!res.ok || body.ok === false) {
    const message = body.error || body.summary || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export function post<T = unknown>(path: string, body: unknown): Promise<Envelope<T>> {
  return api<T>(path, { method: 'POST', body });
}

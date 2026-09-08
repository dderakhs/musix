import type { VercelRequest, VercelResponse } from '@vercel/node';
import { UpstreamError } from './http.js';

export function sendJson(
  res: VercelResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.status(status).json(body);
}

/** Uniform error shape, and never leak an internal stack to the client. */
export function sendError(res: VercelResponse, err: unknown): void {
  if (err instanceof UpstreamError) {
    sendJson(res, 502, { error: err.message, upstream: err.upstream });
    return;
  }
  console.error('[musix] unhandled error', err);
  sendJson(res, 500, { error: 'Internal error' });
}

/** Read a route/query param that may arrive as a repeated value. */
export function param(req: VercelRequest, name: string): string | null {
  const raw = req.query[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length > 0 ? value : null;
}

export function requireGet(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { error: 'Method not allowed' });
    return false;
  }
  return true;
}

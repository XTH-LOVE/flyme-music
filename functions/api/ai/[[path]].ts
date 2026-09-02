// Cloudflare Pages Function (catch-all): /api/ai/*
// OpenAI-compatible AI pass-through. Credentials come from Pages environment
// variables and are never accepted from browser requests.
// - GET /api/ai/status -> { configured, endpoint, model } (never the key)
// - /api/ai/models, /api/ai/chat/completions -> forwarded (SSE-safe streaming)
import {
  PC_USER_AGENT,
  AI_DEFAULT_ENDPOINT,
  AI_DEFAULT_MODEL,
  json,
  errorJson,
  type PagesContext,
} from '../_shared';

export async function onRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
  const endpoint = (context.env.AURORA_AI_ENDPOINT || AI_DEFAULT_ENDPOINT).replace(/\/$/, '');
  const apiKey = context.env.AURORA_AI_API_KEY?.trim() ?? '';
  const configuredModel = context.env.AURORA_AI_MODEL?.trim() || AI_DEFAULT_MODEL;
  const allowedPaths = new Set(['/models', '/chat/completions']);

  // Optional catch-all: params.path is the segments after /api/ai.
  const raw = context.params.path;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const subPath = '/' + segments.join('/') || '/chat/completions';

  if (subPath === '/status') {
    return json({ configured: Boolean(apiKey), endpoint, model: configuredModel });
  }
  if (!allowedPaths.has(subPath)) {
    return json({ error: 'unsupported AI path' }, 400);
  }
  if (!apiKey) {
    return json({ error: 'AI server key is not configured' }, 503);
  }
  const target = endpoint + subPath;
  try {
    const upstream = await fetch(target, {
      method: request.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': PC_USER_AGENT,
        Authorization: 'Bearer ' + apiKey,
      },
      body: request.method === 'GET' ? undefined : await request.text(),
    });
    // Byte-stream passthrough keeps SSE chunks flushing as they arrive.
    return new Response(upstream.body ?? (await upstream.text()), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return errorJson(e);
  }
}

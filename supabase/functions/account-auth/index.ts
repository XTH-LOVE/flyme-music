import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * CORS allowlist. This function holds the service-role key and can create
 * accounts, so it must not answer arbitrary origins with a wildcard. Add your
 * own deployment origins (and any preview domains) via the ALLOWED_ORIGINS
 * secret, comma separated - no scheme-less entries.
 *
 * Note this is defence in depth, not the primary control: a non-browser client
 * ignores CORS entirely, so mass signup is really bounded by the per-IP
 * throttle below plus the Supabase Dashboard auth rate limits.
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://flyme-music.pages.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://tauri.localhost',
  'tauri://localhost',
]

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function resolveOrigin(request: Request): string | null {
  const origin = request.headers.get('origin')
  if (!origin) return null
  const extra = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra].includes(origin) ? origin : null
}

const normalize = (value: string) => value.trim().toLowerCase()
const internalEmail = (username: string) => {
  if (/^[a-z0-9_]+$/.test(username)) return `account.${username}@users.auroramusic.invalid`
  const bytes = new TextEncoder().encode(username)
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `account.u${encoded}@users.auroramusic.invalid`
}

/**
 * New accounts must use a real password: 8-64 chars with at least one letter
 * and one digit. A 6-digit numeric password has only 10^6 combinations and is
 * brute-forceable even through Supabase's built-in auth rate limits. Existing
 * 6-digit accounts are unaffected - they log in via signInWithPassword on the
 * client and only get migrated when they choose to change it.
 */
const strongPassword = (password: string) => /^(?=.*\p{L})(?=.*\d).{8,64}$/u.test(password)

/* Per-isolate register throttle: blunts mass account creation from one IP.
 * Isolates are ephemeral, so pair with Supabase Dashboard auth rate limits
 * (or a Turnstile check) for hard guarantees. */
const REGISTER_WINDOW_MS = 60 * 60 * 1000
const REGISTER_MAX_PER_IP = 5
const registerBuckets = new Map<string, { count: number; resetAt: number }>()

function registerThrottled(ip: string, now: number): boolean {
  const bucket = registerBuckets.get(ip)
  if (!bucket || bucket.resetAt <= now) {
    if (registerBuckets.size > 10_000) {
      for (const [key, value] of registerBuckets) if (value.resetAt <= now) registerBuckets.delete(key)
    }
    registerBuckets.set(ip, { count: 1, resetAt: now + REGISTER_WINDOW_MS })
    return false
  }
  bucket.count += 1
  return bucket.count > REGISTER_MAX_PER_IP
}

Deno.serve(async request => {
  const cors = corsHeaders(resolveOrigin(request))
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await request.json().catch(() => ({}))
    const action = String(body.action || '')
    const username = normalize(String(body.username || ''))
    if (!/^[\p{L}\p{N}_]{2,20}$/u.test(username)) return json({ error: '账号名需要 2-20 位中文、字母、数字或下划线' }, 400)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } })
    if (action === 'register') {
      const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'
      if (registerThrottled(ip, Date.now())) return json({ error: '注册过于频繁，请稍后再试' }, 429)
      const password = String(body.password || '')
      const displayName = String(body.displayName || '').trim()
      if (!strongPassword(password)) return json({ error: '密码需要 8-64 位，且同时包含字母和数字' }, 400)
      if (!displayName || displayName.length > 40) return json({ error: '请输入 1-40 位昵称' }, 400)
      const { error } = await admin.auth.admin.createUser({ email: internalEmail(username), password, email_confirm: true, user_metadata: { nickname: displayName, display_name: displayName, username, login_type: 'username' } })
      if (error) return json({ error: '账号已存在或创建失败' }, 400)
      return json({ success: true })
    }
    return json({ error: '不支持的操作' }, 400)
  } catch { return json({ error: '服务暂时不可用，请稍后重试' }, 500) }
})

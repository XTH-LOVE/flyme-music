import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const normalize = (value: string) => value.trim().toLowerCase()
const internalEmail = (username: string) => {
  if (/^[a-z0-9_]+$/.test(username)) return `account.${username}@users.auroramusic.invalid`
  const bytes = new TextEncoder().encode(username)
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `account.u${encoded}@users.auroramusic.invalid`
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await request.json().catch(() => ({}))
    const action = String(body.action || '')
    const username = normalize(String(body.username || ''))
    if (!/^[\p{L}\p{N}_]{2,20}$/u.test(username)) return json({ error: '账号名需要 2-20 位中文、字母、数字或下划线' }, 400)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } })
    if (action === 'register') {
      const password = String(body.password || '')
      const displayName = String(body.displayName || '').trim()
      if (!/^\d{6}$/.test(password)) return json({ error: '密码必须是 6 位数字' }, 400)
      if (!displayName || displayName.length > 40) return json({ error: '请输入 1-40 位昵称' }, 400)
      const { error } = await admin.auth.admin.createUser({ email: internalEmail(username), password, email_confirm: true, user_metadata: { nickname: displayName, display_name: displayName, username, login_type: 'username' } })
      if (error) return json({ error: '账号已存在或创建失败' }, 400)
      return json({ success: true })
    }
    return json({ error: '不支持的操作' }, 400)
  } catch { return json({ error: '服务暂时不可用，请稍后重试' }, 500) }
})

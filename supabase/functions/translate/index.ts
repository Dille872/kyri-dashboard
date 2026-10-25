// Supabase Edge Function "translate" – v4.1
// Translates short texts with DeepL and stores the result in public.tr_cache.
// Secret needed: DEEPL_API_KEY (Free keys end with ":fx", they use api-free.deepl.com automatically).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const TARGET: Record<string, string> = { en: 'EN-GB', de: 'DE', el: 'EL', ru: 'RU' }
const MAX_TEXTS = 40, MAX_CHARS = 1500, DAILY_LIMIT = 3000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Server key: legacy service_role key, or the new secret key (projects with the new API keys)
function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    const first = typeof keys === 'string' ? keys : keys.default || Object.values(keys)[0]
    if (first) return String(first)
  } catch { /* fall through */ }
  return Deno.env.get('SUPABASE_SECRET_KEY') || ''
}

async function sha(text: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const key = Deno.env.get('DEEPL_API_KEY')
  if (!key) return json({ error: 'DEEPL_API_KEY missing' }, 500)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } })

  // signed-in users only (trainer or client)
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: u } = await admin.auth.getUser(token)
  const user = u?.user
  if (!user) return json({ error: 'unauthorized' }, 401)

  let body: { texts?: unknown; target?: unknown }
  try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const target = String(body.target || '')
  const texts = Array.isArray(body.texts) ? body.texts.map((t) => String(t ?? '')) : null
  if (!TARGET[target] || !texts || texts.length === 0 || texts.length > MAX_TEXTS || texts.some((t) => t.length > MAX_CHARS))
    return json({ error: 'bad request' }, 400)

  const hashes = await Promise.all(texts.map(sha))
  const { data: have } = await admin.from('tr_cache').select('hash, result').eq('lang', target).in('hash', hashes)
  const found = new Map((have || []).map((r) => [r.hash, r.result]))
  const todo = [...new Set(texts.filter((t, i) => !found.has(hashes[i]) && t.trim()))]

  if (todo.length) {
    // simple abuse guard: new translations per user per day
    const since = new Date(Date.now() - 864e5).toISOString()
    const { count } = await admin.from('tr_cache').select('hash', { count: 'exact', head: true }).eq('created_by', user.id).gte('created_at', since)
    if ((count || 0) + todo.length > DAILY_LIMIT) return json({ error: 'daily limit' }, 429)

    const base = Deno.env.get('DEEPL_API_URL') || (key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com')
    const r = await fetch(`${base}/v2/translate`, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: todo, target_lang: TARGET[target], preserve_formatting: true }),
    })
    if (!r.ok) return json({ error: `deepl ${r.status}` }, 502)
    const out = await r.json()
    const rows = await Promise.all(todo.map(async (t, i) => ({
      hash: await sha(t), lang: target, result: out.translations?.[i]?.text ?? t,
      src_lang: out.translations?.[i]?.detected_source_language?.toLowerCase() ?? null, created_by: user.id,
    })))
    rows.forEach((row) => found.set(row.hash, row.result))
    await admin.from('tr_cache').upsert(rows, { onConflict: 'hash,lang', ignoreDuplicates: true })
  }

  return json({ translations: texts.map((t, i) => found.get(hashes[i]) ?? t) })
})

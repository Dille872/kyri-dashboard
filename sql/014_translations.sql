-- v4.1 · Automatic translation (DeepL) – cache + settings
-- Run after 013. Safe to run more than once.

-- One row per text and target language. Only a fingerprint (sha-256) of the original is kept, not the original itself.
create table if not exists public.tr_cache (
  hash       text not null,
  lang       text not null check (lang in ('en', 'el', 'de', 'ru')),
  result     text not null,
  src_lang   text,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (hash, lang)
);
alter table public.tr_cache enable row level security;   -- no policies: nobody reads the table directly
revoke all on public.tr_cache from anon, authenticated;

-- Read translations for texts you already have (you must know the exact text to get its translation).
create or replace function public.tr_get(p_hashes text[], p_lang text)
returns table (hash text, result text)
language sql stable security definer set search_path = public as $$
  select c.hash, c.result from public.tr_cache c
  where c.lang = p_lang and c.hash = any (p_hashes[1:200]) and auth.uid() is not null
$$;
revoke execute on function public.tr_get(text[], text) from public, anon;
grant execute on function public.tr_get(text[], text) to authenticated;

-- Trainer switch: also translate client comments (off by default – may contain health details).
alter table public.trainers add column if not exists translate_comments boolean not null default false;

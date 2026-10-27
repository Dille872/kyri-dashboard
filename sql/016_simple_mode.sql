-- ============================================================
-- v4.4.0 – Simple mode: programs & online coaching can be switched on in Settings.
-- Off (default): the app is sessions, packs, rules and payments only.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- ============================================================
alter table public.trainers add column if not exists coaching_enabled boolean not null default false;

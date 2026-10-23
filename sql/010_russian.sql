-- ============================================================
-- v2.2.0 – Russian as 4th language (EN / ΕΛ / DE / RU).
-- Run once in Supabase → SQL Editor. Safe to run again.
-- ============================================================

do $$ declare r record; begin
  for r in select conrelid::regclass as tbl, conname from pg_constraint
           where contype = 'c' and conrelid in ('public.trainers'::regclass, 'public.clients'::regclass)
             and pg_get_constraintdef(oid) ~ '''de''' loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
alter table public.trainers add constraint trainers_default_lang_check check (default_lang in ('en','el','de','ru'));
alter table public.clients  add constraint clients_lang_check check (lang in ('en','el','de','ru'));

create or replace function public.set_my_lang(p_lang text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_lang not in ('en','el','de','ru') then raise exception 'invalid language'; end if;
  update clients set lang = p_lang where user_id = auth.uid();
end $$;

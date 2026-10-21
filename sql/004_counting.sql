-- ============================================================
-- v1.1.2 – Late cancellations; no-shows and late cancellations
-- count against the client's pack (like a done session).
-- Run once in Supabase → SQL Editor. Safe to run again.
-- ============================================================

alter table public.sessions drop constraint if exists sessions_status_check;
alter table public.sessions add constraint sessions_status_check
  check (status in ('planned','done','cancelled','late_cancel','no_show'));

create or replace function public.session_counts(st text)
returns boolean language sql immutable as $$ select st in ('done','no_show','late_cancel') $$;

create or replace function public.sessions_count_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and session_counts(old.status) and old.client_id is not null then
    update clients set sessions_used = greatest(sessions_used - 1, 0) where id = old.client_id;
  end if;
  if tg_op in ('INSERT','UPDATE') and session_counts(new.status) and new.client_id is not null then
    update clients set sessions_used = sessions_used + 1 where id = new.client_id;
  end if;
  return coalesce(new, old);
end $$;

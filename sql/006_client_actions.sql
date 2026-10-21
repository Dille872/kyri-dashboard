-- ============================================================
-- v1.4.0 – Client actions: cancel a session, contact the trainer,
-- request a new pack.
-- Run once in Supabase → SQL Editor (after 005). Safe to run again.
-- ============================================================

alter table public.trainers add column if not exists phone text;                         -- WhatsApp number, e.g. +357 99 123456
alter table public.trainers add column if not exists cancel_hours int not null default 24; -- free cancellation until X hours before

alter table public.sessions add column if not exists cancelled_by text;      -- 'client' when the client cancelled in the app
alter table public.sessions add column if not exists cancelled_at timestamptz;

-- ---------- Pack renewal requests ----------
create table if not exists public.renewal_requests (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainers(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  package_id  uuid references public.packages(id) on delete set null,
  status      text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index if not exists renewal_requests_trainer_idx on public.renewal_requests (trainer_id, status);

alter table public.renewal_requests enable row level security;
drop policy if exists renewal_admin on public.renewal_requests;
create policy renewal_admin on public.renewal_requests for all
  using (is_trainer_admin(trainer_id)) with check (is_trainer_admin(trainer_id));
drop policy if exists renewal_client_read on public.renewal_requests;
create policy renewal_client_read on public.renewal_requests for select
  using (client_id in (select my_client_ids()));
grant select, insert, update, delete on public.renewal_requests to authenticated;

-- ---------- Client cancels a session ----------
-- In time (more than cancel_hours before) → 'cancelled' (doesn't count).
-- Later → 'late_cancel' (counts against the pack).
create or replace function public.client_cancel_session(p_session uuid)
returns text language plpgsql security definer set search_path = public as $$
declare s sessions; tr trainers; st text;
begin
  select * into s from sessions where id = p_session;
  if not found or s.client_id is null or s.client_id not in (select my_client_ids()) then raise exception 'not allowed'; end if;
  if s.status <> 'planned' or s.starts_at <= now() then raise exception 'cannot cancel'; end if;
  select * into tr from trainers where id = s.trainer_id;
  st := case when now() < s.starts_at - make_interval(hours => tr.cancel_hours) then 'cancelled' else 'late_cancel' end;
  update sessions set status = st, cancelled_by = 'client', cancelled_at = now() where id = s.id;
  return st;
end $$;

-- ---------- Client asks for a new pack ----------
create or replace function public.request_renewal(p_client uuid, p_package uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c clients; rid uuid;
begin
  select * into c from clients where id = p_client and user_id = auth.uid() and active;
  if not found then raise exception 'not allowed'; end if;
  if not exists (select 1 from packages where id = p_package and trainer_id = c.trainer_id and active) then raise exception 'invalid package'; end if;
  if exists (select 1 from renewal_requests where client_id = c.id and status = 'pending') then raise exception 'already requested'; end if;
  insert into renewal_requests (trainer_id, client_id, package_id) values (c.trainer_id, c.id, p_package) returning id into rid;
  return rid;
end $$;

-- ---------- Trainer accepts / declines ----------
-- Accept: switches the client to the package and makes the payment due today.
-- The new sessions are added when Kyri confirms that payment (as for every pack).
create or replace function public.decide_renewal(p_request uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r renewal_requests; pk packages;
begin
  select * into r from renewal_requests where id = p_request;
  if not found or not is_trainer_admin(r.trainer_id) then raise exception 'not allowed'; end if;
  if r.status <> 'pending' then raise exception 'already decided'; end if;
  update renewal_requests set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now() where id = r.id;
  if p_accept then
    select * into pk from packages where id = r.package_id;
    update clients set package_id = pk.id, price = pk.price, billing = pk.billing,
                       sessions_total = coalesce(sessions_total, pk.sessions), next_due_date = current_date
     where id = r.client_id;
  end if;
end $$;

grant execute on function public.client_cancel_session(uuid) to authenticated;
grant execute on function public.request_renewal(uuid, uuid) to authenticated;
grant execute on function public.decide_renewal(uuid, boolean) to authenticated;

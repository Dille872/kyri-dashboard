-- ============================================================
-- Coach Dashboard – Schema v1.0.0
-- Multi-trainer from day one: every row belongs to a trainer.
-- Run once in Supabase → SQL Editor (whole file).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table if not exists public.trainers (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  brand_name    text not null,                 -- e.g. "Train with Kyri"
  owner_name    text,                          -- e.g. "Kyriakos Nicolaou"
  tagline       text,                          -- e.g. "Train with purpose."
  logo_url      text,                          -- empty = /logo.png from the app
  account_name  text,                          -- name on the bank account
  iban          text,
  bic           text,
  revolut_url   text,                          -- e.g. https://revolut.me/handle
  currency      text not null default 'EUR',
  default_lang  text not null default 'en' check (default_lang in ('en','el','de')),
  created_at    timestamptz not null default now()
);

-- Who may run a trainer's dashboard. Matched by email on first login.
create table if not exists public.trainer_members (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainers(id) on delete cascade,
  email       text not null,
  user_id     uuid references auth.users(id) on delete set null,
  role        text not null default 'admin' check (role in ('admin')),
  created_at  timestamptz not null default now()
);
create unique index if not exists trainer_members_email_uq on public.trainer_members (trainer_id, lower(email));

-- Package templates the trainer sells.
create table if not exists public.packages (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainers(id) on delete cascade,
  name        text not null,                   -- e.g. "10-session pack"
  sessions    int,                             -- sessions per pack / per period; null = no limit
  price       numeric(10,2) not null default 0,
  billing     text not null default 'monthly' check (billing in ('pack','monthly','weekly')),
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.clients (
  id              uuid primary key default gen_random_uuid(),
  trainer_id      uuid not null references public.trainers(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,  -- set on first login
  name            text not null,
  email           text not null,
  phone           text,
  lang            text not null default 'en' check (lang in ('en','el','de')),
  package_id      uuid references public.packages(id) on delete set null,
  price           numeric(10,2) not null default 0,
  billing         text not null default 'monthly' check (billing in ('pack','monthly','weekly')),
  sessions_total  int,                         -- current pack/period size; null = no limit
  sessions_used   int not null default 0,      -- maintained by trigger on sessions
  next_due_date   date,                        -- null = nothing due
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create unique index if not exists clients_email_uq on public.clients (trainer_id, lower(email));
create index if not exists clients_user_idx on public.clients (user_id);

create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  trainer_id    uuid not null references public.trainers(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete cascade,  -- null = trainer's own time
  starts_at     timestamptz not null,
  duration_min  int not null default 60 check (duration_min between 5 and 600),
  kind          text not null default 'strength' check (kind in ('strength','mobility','conditioning','online','own')),
  status        text not null default 'planned' check (status in ('planned','done','cancelled','no_show')),
  location      text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists sessions_trainer_time_idx on public.sessions (trainer_id, starts_at);
create index if not exists sessions_client_idx on public.sessions (client_id);

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  trainer_id    uuid not null references public.trainers(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  amount        numeric(10,2) not null check (amount >= 0),
  method        text not null check (method in ('revolut','bank','cash')),
  status        text not null default 'reported' check (status in ('reported','confirmed','rejected')),
  reference     text,
  paid_on       date not null default current_date,
  reported_at   timestamptz not null default now(),
  decided_at    timestamptz,
  created_by    uuid default auth.uid(),
  note          text
);
create index if not exists payments_trainer_idx on public.payments (trainer_id, status);
create index if not exists payments_client_idx on public.payments (client_id);

-- ---------- Helpers ----------

create or replace function public.is_trainer_admin(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainer_members m where m.trainer_id = t and m.user_id = auth.uid());
$$;

create or replace function public.is_trainer_client(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from clients c where c.trainer_id = t and c.user_id = auth.uid() and c.active);
$$;

create or replace function public.my_client_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from clients c where c.user_id = auth.uid() and c.active;
$$;

-- ---------- RLS ----------

alter table public.trainers        enable row level security;
alter table public.trainer_members enable row level security;
alter table public.packages        enable row level security;
alter table public.clients         enable row level security;
alter table public.sessions        enable row level security;
alter table public.payments        enable row level security;

drop policy if exists trainers_read on public.trainers;
create policy trainers_read on public.trainers for select
  using (is_trainer_admin(id) or is_trainer_client(id));
drop policy if exists trainers_update on public.trainers;
create policy trainers_update on public.trainers for update
  using (is_trainer_admin(id)) with check (is_trainer_admin(id));

drop policy if exists members_read on public.trainer_members;
create policy members_read on public.trainer_members for select
  using (user_id = auth.uid() or is_trainer_admin(trainer_id));

drop policy if exists packages_admin on public.packages;
create policy packages_admin on public.packages for all
  using (is_trainer_admin(trainer_id)) with check (is_trainer_admin(trainer_id));
drop policy if exists packages_client_read on public.packages;
create policy packages_client_read on public.packages for select
  using (is_trainer_client(trainer_id));

drop policy if exists clients_admin on public.clients;
create policy clients_admin on public.clients for all
  using (is_trainer_admin(trainer_id)) with check (is_trainer_admin(trainer_id));
drop policy if exists clients_self_read on public.clients;
create policy clients_self_read on public.clients for select
  using (user_id = auth.uid());

drop policy if exists sessions_admin on public.sessions;
create policy sessions_admin on public.sessions for all
  using (is_trainer_admin(trainer_id)) with check (is_trainer_admin(trainer_id));
drop policy if exists sessions_client_read on public.sessions;
create policy sessions_client_read on public.sessions for select
  using (client_id in (select my_client_ids()));

drop policy if exists payments_admin on public.payments;
create policy payments_admin on public.payments for all
  using (is_trainer_admin(trainer_id)) with check (is_trainer_admin(trainer_id));
drop policy if exists payments_client_read on public.payments;
create policy payments_client_read on public.payments for select
  using (client_id in (select my_client_ids()));

-- ---------- Session counter ----------
-- A session that is marked "done" counts against the client's pack.

create or replace function public.sessions_count_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.status = 'done' and old.client_id is not null then
    update clients set sessions_used = greatest(sessions_used - 1, 0) where id = old.client_id;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.status = 'done' and new.client_id is not null then
    update clients set sessions_used = sessions_used + 1 where id = new.client_id;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists sessions_count on public.sessions;
create trigger sessions_count after insert or update of status, client_id or delete on public.sessions
  for each row execute function public.sessions_count_trg();

-- ---------- RPCs ----------

-- Called right after login: links the signed-in email to invited trainer/client rows.
create or replace function public.claim_access()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  em text := lower(coalesce(auth.jwt() ->> 'email', ''));
  uid uuid := auth.uid();
begin
  if uid is null or em = '' then
    return jsonb_build_object('admin_of', '[]'::jsonb, 'client_of', '[]'::jsonb);
  end if;
  update trainer_members set user_id = uid where lower(email) = em and user_id is null;
  update clients set user_id = uid where lower(email) = em and user_id is null;
  return jsonb_build_object(
    'admin_of',  coalesce((select jsonb_agg(trainer_id) from trainer_members where user_id = uid), '[]'::jsonb),
    'client_of', coalesce((select jsonb_agg(jsonb_build_object('client_id', id, 'trainer_id', trainer_id))
                           from clients where user_id = uid and active), '[]'::jsonb)
  );
end $$;

-- Client says "I've paid". Creates a payment the trainer has to confirm.
create or replace function public.report_payment(p_client uuid, p_method text, p_amount numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c clients; pid uuid;
begin
  select * into c from clients where id = p_client and user_id = auth.uid() and active;
  if not found then raise exception 'not allowed'; end if;
  if p_method not in ('revolut','bank') then raise exception 'invalid method'; end if;
  if exists (select 1 from payments where client_id = c.id and status = 'reported') then
    raise exception 'already reported';
  end if;
  insert into payments (trainer_id, client_id, amount, method, status, reference)
  values (c.trainer_id, c.id, coalesce(p_amount, c.price), p_method, 'reported', c.name)
  returning id into pid;
  return pid;
end $$;

-- Moves the client to the next billing period after a confirmed payment.
create or replace function public.advance_period(p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c clients; pk packages;
begin
  select * into c from clients where id = p_client;
  if c.billing = 'monthly' then
    update clients set next_due_date = coalesce(next_due_date, current_date) + interval '1 month',
                       sessions_used = 0
     where id = c.id;
  elsif c.billing = 'weekly' then
    update clients set next_due_date = coalesce(next_due_date, current_date) + interval '7 days',
                       sessions_used = 0
     where id = c.id;
  else -- pack: start a fresh pack, remaining sessions carry over
    select * into pk from packages where id = c.package_id;
    update clients set
      sessions_total = case when c.sessions_total is null then null
                            else greatest(c.sessions_total - c.sessions_used, 0) + coalesce(pk.sessions, c.sessions_total) end,
      sessions_used  = 0,
      next_due_date  = null
     where id = c.id;
  end if;
end $$;

-- Trainer confirms or rejects a reported payment.
create or replace function public.decide_payment(p_payment uuid, p_confirm boolean)
returns void language plpgsql security definer set search_path = public as $$
declare p payments;
begin
  select * into p from payments where id = p_payment;
  if not found or not is_trainer_admin(p.trainer_id) then raise exception 'not allowed'; end if;
  if p.status <> 'reported' then raise exception 'already decided'; end if;
  update payments set status = case when p_confirm then 'confirmed' else 'rejected' end,
                      decided_at = now()
   where id = p.id;
  if p_confirm then perform advance_period(p.client_id); end if;
end $$;

-- Trainer records a payment directly (cash, or a transfer the client never reported).
create or replace function public.record_payment(p_client uuid, p_amount numeric, p_method text, p_paid_on date default current_date, p_advance boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare c clients; pid uuid;
begin
  select * into c from clients where id = p_client;
  if not found or not is_trainer_admin(c.trainer_id) then raise exception 'not allowed'; end if;
  -- a pending client report for this client is resolved by this payment
  update payments set status = 'rejected', decided_at = now(), note = 'replaced by recorded payment'
   where client_id = c.id and status = 'reported';
  insert into payments (trainer_id, client_id, amount, method, status, paid_on, decided_at, reference)
  values (c.trainer_id, c.id, p_amount, p_method, 'confirmed', coalesce(p_paid_on, current_date), now(), c.name)
  returning id into pid;
  if p_advance then perform advance_period(c.id); end if;
  return pid;
end $$;

-- Client picks their language.
create or replace function public.set_my_lang(p_lang text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_lang not in ('en','el','de') then raise exception 'invalid language'; end if;
  update clients set lang = p_lang where user_id = auth.uid();
end $$;

revoke all on function public.advance_period(uuid) from public, anon, authenticated;
grant execute on function public.claim_access() to authenticated;
grant execute on function public.report_payment(uuid, text, numeric) to authenticated;
grant execute on function public.decide_payment(uuid, boolean) to authenticated;
grant execute on function public.record_payment(uuid, numeric, text, date, boolean) to authenticated;
grant execute on function public.set_my_lang(text) to authenticated;

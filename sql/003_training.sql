-- ============================================================
-- v1.1.0 – Gym/Online, recurring sessions, training log, online plans
-- Run once in Supabase → SQL Editor (after 001_schema.sql).
-- Safe to run again.
-- ============================================================

-- ---------- New columns ----------

alter table public.trainers add column if not exists lock_overdue_days int;      -- null = off
alter table public.trainers add column if not exists client_history_weeks int;   -- null = full history

alter table public.clients add column if not exists mode text not null default 'gym';
alter table public.clients add column if not exists checkin_weekday int;         -- 1 = Monday … 7 = Sunday
alter table public.clients add column if not exists show_training boolean not null default true;
do $$ begin
  alter table public.clients add constraint clients_mode_chk check (mode in ('gym','online','hybrid'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clients add constraint clients_checkin_chk check (checkin_weekday between 1 and 7);
exception when duplicate_object then null; end $$;

alter table public.sessions add column if not exists format text not null default 'gym';
alter table public.sessions add column if not exists meeting_url text;
alter table public.sessions add column if not exists series_id uuid;
do $$ begin
  alter table public.sessions add constraint sessions_format_chk check (format in ('gym','online'));
exception when duplicate_object then null; end $$;
create index if not exists sessions_series_idx on public.sessions (series_id);
-- old "online" kind → format online
update public.sessions set format = 'online', kind = 'strength' where kind = 'online';

-- ---------- Private trainer notes per session (clients never see these) ----------

create table if not exists public.session_notes (
  session_id  uuid primary key references public.sessions(id) on delete cascade,
  trainer_id  uuid not null references public.trainers(id) on delete cascade,
  note        text not null default '',
  updated_at  timestamptz not null default now()
);

-- ---------- Online plan: workouts per week ----------

create table if not exists public.plan_workouts (
  id            uuid primary key default gen_random_uuid(),
  trainer_id    uuid not null references public.trainers(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  week_start    date not null,                 -- Monday of the week
  title         text not null default 'Workout',
  position      int not null default 0,
  notes         text,                          -- visible to the client (instructions)
  completed_at  timestamptz,                   -- set by the client
  client_note   text,                          -- client's feedback
  created_at    timestamptz not null default now()
);
create index if not exists plan_workouts_client_week_idx on public.plan_workouts (client_id, week_start);

-- ---------- Exercise rows: used by gym sessions AND online plan workouts ----------

create table if not exists public.exercise_rows (
  id               uuid primary key default gen_random_uuid(),
  trainer_id       uuid not null references public.trainers(id) on delete cascade,
  client_id        uuid not null references public.clients(id) on delete cascade,
  session_id       uuid references public.sessions(id) on delete cascade,
  plan_workout_id  uuid references public.plan_workouts(id) on delete cascade,
  position         int not null default 0,
  exercise         text not null,
  sets             int,
  reps             text,                       -- text so "8-10" or "45 s" works
  kg               text,                       -- target (plan) or done (session); text so "+10" or "BW" works
  actual_reps      text,                       -- filled in by the client (plan)
  actual_kg        text,                       -- filled in by the client (plan)
  done             boolean not null default false,
  note             text,
  created_at       timestamptz not null default now(),
  check (session_id is not null or plan_workout_id is not null)
);
create index if not exists exercise_rows_session_idx on public.exercise_rows (session_id);
create index if not exists exercise_rows_workout_idx on public.exercise_rows (plan_workout_id);
create index if not exists exercise_rows_client_idx on public.exercise_rows (client_id);

-- ---------- Visibility for clients ----------

-- Can the signed-in client see training details of client c right now?
create or replace function public.client_training_visible(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients cl join trainers tr on tr.id = cl.trainer_id
    where cl.id = c and cl.user_id = auth.uid() and cl.active and cl.show_training
      and not (
        tr.lock_overdue_days is not null and cl.next_due_date is not null
        and cl.next_due_date < current_date - tr.lock_overdue_days
        and not exists (select 1 from payments p where p.client_id = cl.id and p.status = 'reported')
      )
  );
$$;

-- Oldest date a client may see (null = everything)
create or replace function public.client_training_cutoff(c uuid)
returns date language sql stable security definer set search_path = public as $$
  select case when tr.client_history_weeks is null then null
              else current_date - (tr.client_history_weeks * 7) end
  from clients cl join trainers tr on tr.id = cl.trainer_id where cl.id = c;
$$;

-- For the client app: why training is hidden
create or replace function public.my_training_status(p_client uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when cl.user_id is distinct from auth.uid() then 'none'
    when not cl.show_training then 'off'
    when client_training_visible(cl.id) then 'visible'
    else 'locked' end
  from clients cl where cl.id = p_client;
$$;

-- ---------- RLS ----------

alter table public.session_notes enable row level security;
alter table public.plan_workouts enable row level security;
alter table public.exercise_rows enable row level security;

drop policy if exists session_notes_admin on public.session_notes;
create policy session_notes_admin on public.session_notes for all
  using (is_trainer_admin(trainer_id)) with check (is_trainer_admin(trainer_id));

drop policy if exists plan_workouts_admin on public.plan_workouts;
create policy plan_workouts_admin on public.plan_workouts for all
  using (is_trainer_admin(trainer_id)) with check (is_trainer_admin(trainer_id));
drop policy if exists plan_workouts_client_read on public.plan_workouts;
create policy plan_workouts_client_read on public.plan_workouts for select
  using (client_training_visible(client_id)
         and (client_training_cutoff(client_id) is null or week_start >= client_training_cutoff(client_id) - 6));

drop policy if exists exercise_rows_admin on public.exercise_rows;
create policy exercise_rows_admin on public.exercise_rows for all
  using (is_trainer_admin(trainer_id)) with check (is_trainer_admin(trainer_id));
drop policy if exists exercise_rows_client_read on public.exercise_rows;
create policy exercise_rows_client_read on public.exercise_rows for select
  using (client_training_visible(client_id)
         and (client_training_cutoff(client_id) is null
              or coalesce((select (s.starts_at at time zone 'Asia/Nicosia')::date from sessions s where s.id = session_id),
                          (select w.week_start + 6 from plan_workouts w where w.id = plan_workout_id))
                 >= client_training_cutoff(client_id)));

-- ---------- Client actions (plan) ----------

create or replace function public.log_exercise(p_row uuid, p_actual_kg text, p_actual_reps text, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r exercise_rows;
begin
  select * into r from exercise_rows where id = p_row;
  if not found or r.plan_workout_id is null or not client_training_visible(r.client_id) then raise exception 'not allowed'; end if;
  update exercise_rows set actual_kg = nullif(trim(p_actual_kg), ''), actual_reps = nullif(trim(p_actual_reps), ''), done = coalesce(p_done, false)
   where id = r.id;
end $$;

create or replace function public.complete_workout(p_workout uuid, p_done boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare w plan_workouts;
begin
  select * into w from plan_workouts where id = p_workout;
  if not found or not client_training_visible(w.client_id) then raise exception 'not allowed'; end if;
  update plan_workouts set completed_at = case when p_done then coalesce(completed_at, now()) else null end,
                           client_note = coalesce(nullif(trim(p_note), ''), client_note)
   where id = w.id;
end $$;

-- ---------- Trainer helper: copy a plan week to another week ----------
-- Targets for the new week take the client's actual kg/reps where filled in.
create or replace function public.copy_plan_week(p_client uuid, p_from date, p_to date)
returns int language plpgsql security definer set search_path = public as $$
declare c clients; w plan_workouts; nw uuid; n int := 0;
begin
  select * into c from clients where id = p_client;
  if not found or not is_trainer_admin(c.trainer_id) then raise exception 'not allowed'; end if;
  for w in select * from plan_workouts where client_id = p_client and week_start = p_from order by position loop
    insert into plan_workouts (trainer_id, client_id, week_start, title, position, notes)
    values (w.trainer_id, w.client_id, p_to, w.title, w.position, w.notes) returning id into nw;
    insert into exercise_rows (trainer_id, client_id, plan_workout_id, position, exercise, sets, reps, kg, note)
    select trainer_id, client_id, nw, position, exercise, sets, coalesce(actual_reps, reps), coalesce(actual_kg, kg), note
      from exercise_rows where plan_workout_id = w.id order by position;
    n := n + 1;
  end loop;
  return n;
end $$;

grant select, insert, update, delete on public.session_notes, public.plan_workouts, public.exercise_rows to authenticated;
grant execute on function public.my_training_status(uuid) to authenticated;
grant execute on function public.log_exercise(uuid, text, text, boolean) to authenticated;
grant execute on function public.complete_workout(uuid, boolean, text) to authenticated;
grant execute on function public.copy_plan_week(uuid, date, date) to authenticated;

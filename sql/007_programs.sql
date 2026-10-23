-- ============================================================
-- v2.0.0 – Programs (days + blocks), exercise library with notes/videos,
-- kg history, online sessions step by step, PAR-Q, rules, archive.
-- Run once in Supabase → SQL Editor (after 006). Safe to run again.
--
-- Privacy: clients can NOT read programs, days or the library directly.
-- Online clients get today's workout only through the RPCs below,
-- one step at a time.
-- ============================================================

-- ---------- Trainer settings ----------
alter table public.trainers add column if not exists rules_text text;
alter table public.trainers add column if not exists reminder_days int not null default 2;
alter table public.trainers add column if not exists parq_questions jsonb not null default '[
  {"q":"Has a doctor ever said you have a heart condition and should only do activity recommended by a doctor?","type":"yn","flag":true},
  {"q":"Do you feel pain in your chest when you do physical activity?","type":"yn","flag":true},
  {"q":"In the past month, have you had chest pain when you were not doing physical activity?","type":"yn","flag":true},
  {"q":"Do you lose your balance because of dizziness, or have you ever lost consciousness?","type":"yn","flag":true},
  {"q":"Do you have a bone or joint problem that could get worse with more physical activity?","type":"yn","flag":true},
  {"q":"Is a doctor currently prescribing medication for your blood pressure or a heart condition?","type":"yn","flag":true},
  {"q":"Do you know of any other reason why you should not do physical activity?","type":"yn","flag":true}
]'::jsonb;

-- ---------- Client onboarding + archive ----------
alter table public.clients add column if not exists parq_at timestamptz;
alter table public.clients add column if not exists rules_accepted_at timestamptz;
alter table public.clients add column if not exists archived_at timestamptz;

create table if not exists public.parq_responses (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references public.trainers(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  answers      jsonb not null,               -- [{q, type, flag, answer (true/false/null), text}]
  explanation  text,
  signed_name  text not null,
  flagged      boolean not null default false,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists parq_client_idx on public.parq_responses (client_id, created_at desc);

-- ---------- Programs ----------
create table if not exists public.programs (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainers(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  title       text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists programs_client_uq on public.programs (client_id);   -- one program per client

create table if not exists public.program_days (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  trainer_id  uuid not null references public.trainers(id) on delete cascade,
  position    int not null default 1,
  title       text not null,                 -- "Day 1"
  focus       text,                          -- "Strength + Power"
  note        text,                          -- shown to online clients before the session
  blocks      jsonb not null default '[]'    -- [{type:'single'|'superset'|'finisher', rounds, items:[{exercise, rx, target}] | lines:[text]}]
);
create index if not exists program_days_prog_idx on public.program_days (program_id, position);

-- Exercise library: one note + video per exercise name, reused in every program
create table if not exists public.exercise_library (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainers(id) on delete cascade,
  name        text not null,
  note        text,
  video_type  text check (video_type in ('yt','file')),
  video_url   text,
  created_at  timestamptz not null default now()
);
create unique index if not exists exercise_library_uq on public.exercise_library (trainer_id, lower(name));

-- Online client finished a workout
create table if not exists public.workout_logs (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references public.trainers(id) on delete cascade,
  client_id    uuid not null references public.clients(id) on delete cascade,
  day_id       uuid references public.program_days(id) on delete set null,
  day_title    text,
  minutes      int,
  note         text,
  finished_at  timestamptz not null default now()
);
create index if not exists workout_logs_trainer_idx on public.workout_logs (trainer_id, finished_at desc);

-- kg history per client + exercise (from Kyri's log, the client's session, or the notes import)
create table if not exists public.exercise_logs (
  id              uuid primary key default gen_random_uuid(),
  trainer_id      uuid not null references public.trainers(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  day_id          uuid references public.program_days(id) on delete set null,
  session_id      uuid references public.sessions(id) on delete set null,
  workout_log_id  uuid references public.workout_logs(id) on delete cascade,
  exercise        text not null,
  kg              numeric(6,2),
  reps            text,
  source          text not null default 'trainer' check (source in ('trainer','client','import')),
  logged_on       date not null default current_date,
  created_at      timestamptz not null default now()
);
create index if not exists exercise_logs_client_idx on public.exercise_logs (client_id, lower(exercise), logged_on);

-- ---------- RLS: trainer only ----------
alter table public.parq_responses   enable row level security;
alter table public.programs         enable row level security;
alter table public.program_days     enable row level security;
alter table public.exercise_library enable row level security;
alter table public.workout_logs     enable row level security;
alter table public.exercise_logs    enable row level security;

do $$ declare tbl text; begin
  foreach tbl in array array['parq_responses','programs','program_days','exercise_library','workout_logs','exercise_logs'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_admin', tbl);
    execute format('create policy %I on public.%I for all using (is_trainer_admin(trainer_id)) with check (is_trainer_admin(trainer_id))', tbl || '_admin', tbl);
  end loop;
end $$;
grant select, insert, update, delete on public.parq_responses, public.programs, public.program_days,
  public.exercise_library, public.workout_logs, public.exercise_logs to authenticated;

-- ---------- Helpers ----------
create or replace function public.my_active_client(p_client uuid)
returns clients language sql stable security definer set search_path = public as $$
  select * from clients where id = p_client and user_id = auth.uid() and active;
$$;

-- Equipment needed for a day, derived from exercise names (no names are returned)
create or replace function public.day_equipment(p_blocks jsonb)
returns text[] language sql immutable as $$
  with names as (
    select coalesce(i->>'exercise', l) as n
    from jsonb_array_elements(p_blocks) b
    left join lateral jsonb_array_elements(coalesce(b->'items','[]'::jsonb)) i on true
    left join lateral jsonb_array_elements_text(coalesce(b->'lines','[]'::jsonb)) l on true
  ), map(re, label, ord) as (values           -- label = key, translated in the app
    ('smith','smith',1), ('^(?!db ).*deadlift|barbell','barbell',2), ('\mdb\M|dumbbell','dumbbells',3),
    ('\mkb\M|kettlebell','kettlebell',4), ('sled','sled',5), ('^row\M(?!.*\mdb\M)|rower|rowing','rower',6),
    ('bike','bike',7), ('ball','ball',8), ('trx','trx',9), ('step up|box','box',10))
  select coalesce(array_agg(label order by ord), '{}') from map
  where exists (select 1 from names where n ~* re);
$$;

-- Which program day is next for a client (rotation after the last logged day)
create or replace function public.next_day_for(p_client uuid)
returns uuid language sql stable security definer set search_path = public as $$
  with prog as (select id from programs where client_id = p_client),
  days as (select d.id, d.position from program_days d join prog on d.program_id = prog.id),
  last as (
    select d.position from (
      select day_id, finished_at as t from workout_logs where client_id = p_client and day_id is not null
      union all
      select day_id, (logged_on + created_at::time)::timestamp at time zone 'Asia/Nicosia' from exercise_logs where client_id = p_client and day_id is not null
    ) x join days d on d.id = x.day_id order by t desc limit 1)
  select coalesce(
    (select id from days where position > coalesce((select position from last), 0) order by position limit 1),
    (select id from days order by position limit 1));
$$;

-- ---------- Client: onboarding ----------
create or replace function public.submit_parq(p_client uuid, p_answers jsonb, p_explanation text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare c clients; flag boolean;
begin
  select * into c from my_active_client(p_client);
  if c.id is null then raise exception 'not allowed'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;
  select exists (select 1 from jsonb_array_elements(p_answers) a where a->>'type' = 'yn' and (a->>'flag')::boolean and (a->>'answer')::boolean)
    into flag;
  insert into parq_responses (trainer_id, client_id, answers, explanation, signed_name, flagged)
  values (c.trainer_id, c.id, p_answers, nullif(trim(p_explanation), ''), trim(p_name), flag);
  update clients set parq_at = now() where id = c.id;
end $$;

create or replace function public.accept_rules(p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c clients;
begin
  select * into c from my_active_client(p_client);
  if c.id is null then raise exception 'not allowed'; end if;
  update clients set rules_accepted_at = now() where id = c.id;
end $$;

-- ---------- Client: online session ----------
-- Before the session: only what to prepare (no exercise names)
create or replace function public.workout_prep(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clients; d program_days; done_today boolean;
begin
  select * into c from my_active_client(p_client);
  if c.id is null or c.mode = 'gym' then return null; end if;
  select * into d from program_days where id = next_day_for(c.id);
  if d.id is null then return null; end if;
  select exists (select 1 from workout_logs where client_id = c.id and finished_at::date = current_date) into done_today;
  return jsonb_build_object('day_id', d.id, 'title', d.title, 'focus', d.focus, 'note', d.note,
    'steps', jsonb_array_length(d.blocks), 'equipment', to_jsonb(day_equipment(d.blocks)), 'done_today', done_today,
    'week', (select coalesce(jsonb_agg(jsonb_build_object('title', day_title, 'at', finished_at) order by finished_at), '[]')
             from workout_logs where client_id = c.id and finished_at >= date_trunc('week', now())));
end $$;

-- During the session: one block at a time, with Kyri's note/video and the client's last kg
create or replace function public.workout_step(p_client uuid, p_day uuid, p_step int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clients; d program_days; b jsonb; items jsonb;
begin
  select * into c from my_active_client(p_client);
  if c.id is null or c.mode = 'gym' then raise exception 'not allowed'; end if;
  select * into d from program_days where id = p_day and program_id in (select id from programs where client_id = c.id);
  if d.id is null then raise exception 'not allowed'; end if;
  b := d.blocks -> p_step;
  if b is null then return null; end if;
  select coalesce(jsonb_agg(i || jsonb_build_object(
      'note', l.note, 'video_type', l.video_type, 'video_url', l.video_url,
      'last_kg', (select kg from exercise_logs e where e.client_id = c.id and lower(e.exercise) = lower(i->>'exercise') and kg is not null order by logged_on desc, created_at desc limit 1))), '[]')
    into items
  from jsonb_array_elements(coalesce(b->'items','[]'::jsonb)) i
  left join exercise_library l on l.trainer_id = c.trainer_id and lower(l.name) = lower(i->>'exercise');
  return jsonb_build_object('type', b->>'type', 'rounds', b->'rounds', 'items', items, 'lines', coalesce(b->'lines','[]'::jsonb),
                            'step', p_step, 'total', jsonb_array_length(d.blocks), 'title', d.title);
end $$;

-- After the session: kg + note go to Kyri. logs = [{exercise, kg, reps}]
create or replace function public.finish_workout(p_client uuid, p_day uuid, p_logs jsonb, p_note text, p_minutes int)
returns uuid language plpgsql security definer set search_path = public as $$
declare c clients; d program_days; wid uuid;
begin
  select * into c from my_active_client(p_client);
  if c.id is null or c.mode = 'gym' then raise exception 'not allowed'; end if;
  select * into d from program_days where id = p_day and program_id in (select id from programs where client_id = c.id);
  if d.id is null then raise exception 'not allowed'; end if;
  insert into workout_logs (trainer_id, client_id, day_id, day_title, minutes, note)
  values (c.trainer_id, c.id, d.id, d.title, greatest(coalesce(p_minutes, 0), 1), nullif(trim(p_note), ''))
  returning id into wid;
  insert into exercise_logs (trainer_id, client_id, day_id, workout_log_id, exercise, kg, reps, source)
  select c.trainer_id, c.id, d.id, wid, l->>'exercise', nullif(l->>'kg','')::numeric, nullif(l->>'reps',''), 'client'
  from jsonb_array_elements(coalesce(p_logs, '[]'::jsonb)) l
  where coalesce(l->>'exercise','') <> '';
  return wid;
end $$;

grant execute on function public.submit_parq(uuid, jsonb, text, text) to authenticated;
grant execute on function public.accept_rules(uuid) to authenticated;
grant execute on function public.workout_prep(uuid) to authenticated;
grant execute on function public.workout_step(uuid, uuid, int) to authenticated;
grant execute on function public.finish_workout(uuid, uuid, jsonb, text, int) to authenticated;
revoke all on function public.next_day_for(uuid) from public, anon, authenticated;
grant execute on function public.next_day_for(uuid) to authenticated;  -- used by the trainer log (admin RLS still applies to the tables)

-- ---------- Privacy: clients no longer read any training data directly ----------
-- (v1 let clients read their plans and logged exercise rows; v2 shows them nothing
--  about training, online clients only get the step-by-step session above)
drop policy if exists plan_workouts_client_read on public.plan_workouts;
drop policy if exists exercise_rows_client_read on public.exercise_rows;

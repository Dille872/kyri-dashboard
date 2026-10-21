-- ============================================================
-- v1.3.0 – Weekly planning: workout templates, private session plans
-- Run once in Supabase → SQL Editor (after 004). Safe to run again.
--
-- Session exercise rows now mean:
--   sets / reps / kg            = what Kyri planned (may be empty)
--   actual_reps / actual_kg     = what was actually done in the session
-- ============================================================

create table if not exists public.workout_templates (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.trainers(id) on delete cascade,
  name        text not null,
  rows        jsonb not null default '[]',      -- [{exercise, sets, reps, kg}]
  created_at  timestamptz not null default now()
);
create index if not exists workout_templates_trainer_idx on public.workout_templates (trainer_id);

alter table public.workout_templates enable row level security;
drop policy if exists workout_templates_admin on public.workout_templates;
create policy workout_templates_admin on public.workout_templates for all
  using (is_trainer_admin(trainer_id)) with check (is_trainer_admin(trainer_id));
grant select, insert, update, delete on public.workout_templates to authenticated;

-- Clients see a session's exercises only after the session is done.
-- Kyri's plan for upcoming sessions stays private.
drop policy if exists exercise_rows_client_read on public.exercise_rows;
create policy exercise_rows_client_read on public.exercise_rows for select
  using (client_training_visible(client_id)
         and (session_id is null or exists (select 1 from sessions s where s.id = session_id and s.status = 'done'))
         and (client_training_cutoff(client_id) is null
              or coalesce((select (s.starts_at at time zone 'Asia/Nicosia')::date from sessions s where s.id = session_id),
                          (select w.week_start + 6 from plan_workouts w where w.id = plan_workout_id))
                 >= client_training_cutoff(client_id)));

-- ============================================================
-- v3.1.0 – Online sessions: a comment per exercise from the client,
-- and the real duration (stopwatch from "Start" to "Finish") next to the planned one.
-- Run once in Supabase → SQL Editor (after 011). Safe to run again.
-- ============================================================

alter table public.exercise_logs add column if not exists note text;
alter table public.workout_logs  add column if not exists seconds int;
alter table public.workout_logs  add column if not exists planned_minutes int;

-- logs = [{exercise, kg, reps, note}]
drop function if exists public.finish_workout(uuid, uuid, jsonb, text, int);
create or replace function public.finish_workout(p_client uuid, p_day uuid, p_logs jsonb, p_note text, p_minutes int,
                                                 p_seconds int default null, p_planned int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c clients; d program_days; wid uuid;
begin
  select * into c from my_active_client(p_client);
  if c.id is null or c.mode = 'gym' then raise exception 'not allowed'; end if;
  select * into d from program_days where id = p_day and program_id in (select id from programs where client_id = c.id);
  if d.id is null then raise exception 'not allowed'; end if;
  insert into workout_logs (trainer_id, client_id, day_id, day_title, minutes, seconds, planned_minutes, note)
  values (c.trainer_id, c.id, d.id, d.title, greatest(coalesce(p_minutes, 0), 1), nullif(p_seconds, 0), p_planned, nullif(trim(p_note), ''))
  returning id into wid;
  insert into exercise_logs (trainer_id, client_id, day_id, workout_log_id, exercise, kg, reps, note, source)
  select c.trainer_id, c.id, d.id, wid, l->>'exercise', nullif(l->>'kg','')::numeric, nullif(l->>'reps',''), nullif(trim(l->>'note'), ''), 'client'
  from jsonb_array_elements(coalesce(p_logs, '[]'::jsonb)) l
  where coalesce(l->>'exercise','') <> '';
  return wid;
end $$;
grant execute on function public.finish_workout(uuid, uuid, jsonb, text, int, int, int) to authenticated;

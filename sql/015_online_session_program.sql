-- ============================================================
-- v4.3.0 – Online program also for "Gym" clients on the day of an online session.
-- Before: only clients set to "Online" / "Gym + Online" saw their program.
-- A Gym client with an online session booked for today now also gets today's program.
-- Run once in Supabase → SQL Editor (after 009). Safe to run again.
-- ============================================================

-- does the client have an online session today (p_back = 1: also yesterday, for workouts finished after midnight)?
create or replace function public.has_online_today(p_client uuid, p_back int default 0)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions s
    where s.client_id = p_client and s.status in ('planned', 'done') and s.format = 'online'
      and (s.starts_at at time zone 'Asia/Nicosia')::date
          between (now() at time zone 'Asia/Nicosia')::date - p_back and (now() at time zone 'Asia/Nicosia')::date);
$$;
revoke all on function public.has_online_today(uuid, int) from public, anon, authenticated;

create or replace function public.workout_prep(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clients; d program_days; done_today boolean;
begin
  select * into c from my_active_client(p_client);
  if c.id is null then return null; end if;
  if c.mode = 'gym' and not has_online_today(c.id) then return null; end if;
  select * into d from program_days where id = today_day_for(c.id);
  if d.id is null then return null; end if;
  select exists (select 1 from workout_logs where client_id = c.id and finished_at::date = current_date) into done_today;
  return jsonb_build_object('day_id', d.id, 'title', d.title, 'focus', d.focus, 'note', d.note,
    'steps', jsonb_array_length(d.blocks), 'equipment', to_jsonb(day_equipment(d.blocks)), 'done_today', done_today,
    'week', (select coalesce(jsonb_agg(jsonb_build_object('title', day_title, 'at', finished_at) order by finished_at), '[]')
             from workout_logs where client_id = c.id and finished_at >= date_trunc('week', now())));
end $$;

-- step-by-step + finishing: same rule
create or replace function public.workout_step(p_client uuid, p_day uuid, p_step int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clients; d program_days; b jsonb; items jsonb;
begin
  select * into c from my_active_client(p_client);
  if c.id is null or (c.mode = 'gym' and not has_online_today(c.id, 1)) then raise exception 'not allowed'; end if;
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

create or replace function public.finish_workout(p_client uuid, p_day uuid, p_logs jsonb, p_note text, p_minutes int,
                                                 p_seconds int default null, p_planned int default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c clients; d program_days; wid uuid;
begin
  select * into c from my_active_client(p_client);
  if c.id is null or (c.mode = 'gym' and not has_online_today(c.id, 1)) then raise exception 'not allowed'; end if;
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

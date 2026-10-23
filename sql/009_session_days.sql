-- ============================================================
-- v2.1.0 – Program days on calendar sessions.
-- Kyri assigns a program day to a booked session himself (in the calendar or
-- in the program). The day belongs to the session: move the session, the day moves along.
-- Online clients: if today's session has a day, that day opens; otherwise the next in the rotation.
-- Run once in Supabase → SQL Editor (after 007). Safe to run again.
-- ============================================================

alter table public.sessions add column if not exists program_day_id uuid references public.program_days(id) on delete set null;
drop function if exists public.next_days();

-- which day an online client gets today: today's assigned session first, then the rotation
create or replace function public.today_day_for(p_client uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s.program_day_id from sessions s
      where s.client_id = p_client and s.status = 'planned' and s.program_day_id is not null
        and (s.starts_at at time zone 'Asia/Nicosia')::date = (now() at time zone 'Asia/Nicosia')::date
      order by s.starts_at limit 1),
    next_day_for(p_client));
$$;

create or replace function public.workout_prep(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clients; d program_days; done_today boolean;
begin
  select * into c from my_active_client(p_client);
  if c.id is null or c.mode = 'gym' then return null; end if;
  select * into d from program_days where id = today_day_for(c.id);
  if d.id is null then return null; end if;
  select exists (select 1 from workout_logs where client_id = c.id and finished_at::date = current_date) into done_today;
  return jsonb_build_object('day_id', d.id, 'title', d.title, 'focus', d.focus, 'note', d.note,
    'steps', jsonb_array_length(d.blocks), 'equipment', to_jsonb(day_equipment(d.blocks)), 'done_today', done_today,
    'week', (select coalesce(jsonb_agg(jsonb_build_object('title', day_title, 'at', finished_at) order by finished_at), '[]')
             from workout_logs where client_id = c.id and finished_at >= date_trunc('week', now())));
end $$;

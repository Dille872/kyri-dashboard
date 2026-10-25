-- ============================================================
-- v3.0.0 – Numbers for the client's start screen (new look):
-- this week (done / planned), sessions this month, attendance (8 weeks).
-- Only counts, no training content. Run once in Supabase → SQL Editor. Safe to run again.
-- ============================================================

create or replace function public.my_stats(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c clients; wk timestamptz; mo timestamptz; r jsonb;
begin
  select * into c from my_active_client(p_client);
  if c.id is null then return null; end if;
  wk := date_trunc('week', now() at time zone 'Asia/Nicosia') at time zone 'Asia/Nicosia';
  mo := date_trunc('month', now() at time zone 'Asia/Nicosia') at time zone 'Asia/Nicosia';
  select jsonb_build_object(
    'week_done',
      (select count(*) from sessions where client_id = c.id and status = 'done' and starts_at >= wk and starts_at < wk + interval '7 days')
      + (select count(*) from workout_logs where client_id = c.id and finished_at >= wk),
    'week_target', greatest(
      (select count(*) from sessions where client_id = c.id and status <> 'cancelled' and starts_at >= wk and starts_at < wk + interval '7 days')
      + case when c.mode <> 'gym' then (select count(*) from program_days d join programs p on p.id = d.program_id where p.client_id = c.id) else 0 end,
      1),
    'month_done',
      (select count(*) from sessions where client_id = c.id and status = 'done' and starts_at >= mo and starts_at <= now())
      + (select count(*) from workout_logs where client_id = c.id and finished_at >= mo),
    'attendance', (select case when count(*) filter (where status in ('done','no_show','late_cancel')) = 0 then null
                   else round(100.0 * count(*) filter (where status = 'done') / count(*) filter (where status in ('done','no_show','late_cancel'))) end
                   from sessions where client_id = c.id and starts_at >= now() - interval '56 days' and starts_at <= now())
  ) into r;
  return r;
end $$;
grant execute on function public.my_stats(uuid) to authenticated;

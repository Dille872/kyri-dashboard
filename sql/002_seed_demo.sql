-- ============================================================
-- Demo data (fake clients) for building and showing the app.
--
-- 1. Run 001, 003, 004, 005 and 006 first.
-- 2. Check the email in the LAST line (that person becomes the trainer admin), then run this file.
--
-- The six demo clients get "plus" aliases of that email (you+elena@…).
-- Running it again wipes and recreates the demo trainer with fresh dates.
--
-- What it creates:
--   • 6 weeks of training history with rising weights (for the progress view)
--   • a few no-shows / late cancellations (attendance)
--   • this week's and next week's sessions; part of next week is already planned
--   • workout templates, an online plan for Nikos, payments in every state
-- ============================================================

-- helper: number → "72.5" / "70"
create or replace function public.seed_kg(x numeric) returns text language sql immutable as $$
  select trim_scale(round(x * 2) / 2)::text   -- rounds to 0.5 kg
$$;

-- helper: one session plus its exercise rows. rows = [{e, s, r, kg, ak, ar}]
create or replace function public.seed_session(p_t uuid, p_c uuid, p_day date, p_time time, p_kind text, p_status text,
                                               p_loc text, p_rows jsonb default '[]', p_format text default 'gym')
returns uuid language plpgsql as $$
declare sid uuid; r jsonb; i int := 0;
begin
  insert into sessions (trainer_id, client_id, starts_at, kind, status, location, format)
  values (p_t, p_c, (p_day + p_time) at time zone 'Asia/Nicosia', p_kind, p_status, p_loc, p_format)
  returning id into sid;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    insert into exercise_rows (trainer_id, client_id, session_id, position, exercise, sets, reps, kg, actual_reps, actual_kg, done)
    values (p_t, p_c, sid, i, r->>'e', (r->>'s')::int, r->>'r', r->>'kg', nullif(r->>'ar', ''), nullif(r->>'ak', ''), r ? 'ar');
  end loop;
  return sid;
end $$;

create or replace function public.seed_demo(admin_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t uuid;
  domain_part text := split_part(admin_email, '@', 2);
  alias text := split_part(admin_email, '@', 1) || '+';
  p10 uuid; p1w uuid; p2w uuid; pon uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid;
  wk date := date_trunc('week', current_date)::date;   -- Monday of this week
  w int; n int; st text; d date; w_id uuid; i int;
begin
  delete from trainers where slug = 'demo';

  insert into trainers (slug, brand_name, owner_name, tagline, account_name, iban, bic, revolut_url, default_lang)
  values ('demo', 'Train with Kyri', 'Kyriakos Nicolaou', 'Train with purpose.',
          'Kyriakos Nicolaou', 'CY17 0020 0128 0000 0012 0052 7600', 'BANKCY2N',
          'https://revolut.me/your-handle', 'en')
  returning id into t;
  update trainers set phone = '+357 99 000000', cancel_hours = 24 where id = t;

  insert into trainer_members (trainer_id, email) values (t, lower(admin_email));

  insert into packages (trainer_id, name, sessions, price, billing, sort) values (t, '10-session pack', 10, 450, 'pack', 1) returning id into p10;
  insert into packages (trainer_id, name, sessions, price, billing, sort) values (t, 'Monthly 1x/week', 4, 150, 'monthly', 2) returning id into p1w;
  insert into packages (trainer_id, name, sessions, price, billing, sort) values (t, 'Monthly 2x/week', 8, 280, 'monthly', 3) returning id into p2w;
  insert into packages (trainer_id, name, sessions, price, billing, sort) values (t, 'Online coaching', null, 100, 'monthly', 4) returning id into pon;

  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date, mode)
    values (t, 'Elena Georgiou',     alias || 'elena@'   || domain_part, 'el', p10, 450, 'pack',    10, current_date + 3,  'gym')    returning id into c1;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date, mode, checkin_weekday)
    values (t, 'Andreas Christou',   alias || 'andreas@' || domain_part, 'el', p2w, 280, 'monthly',  8, current_date + 11, 'hybrid', 7) returning id into c2;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date, mode)
    values (t, 'Maria Constantinou', alias || 'maria@'   || domain_part, 'en', p1w, 150, 'monthly',  4, current_date - 6,  'gym')    returning id into c3;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date, mode, checkin_weekday)
    values (t, 'Nikos Ioannou',      alias || 'nikos@'   || domain_part, 'en', pon, 100, 'monthly', null, current_date + 29, 'online', extract(isodow from current_date)::int) returning id into c4;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date, mode)
    values (t, 'Lena Hoffmann',      alias || 'lena@'    || domain_part, 'de', p10, 450, 'pack',    10, null,              'gym')    returning id into c5;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date, mode)
    values (t, 'Chris Petrides',     alias || 'chris@'   || domain_part, 'en', p2w, 280, 'monthly',  8, current_date + 10, 'gym')    returning id into c6;

  -- ---------- 6 weeks of history (weights rise a little every session) ----------
  n := 0;
  for w in reverse 6..1 loop
    -- Elena: Mon + Thu 17:30, lower body + pull
    for i in 0..1 loop
      d := wk - 7 * w + case when i = 0 then 0 else 3 end; n := n + 1;
      perform seed_session(t, c1, d, '17:30', 'strength', 'done', 'Studio', jsonb_build_array(
        jsonb_build_object('e','Back squat','s',4,'r','8','kg',seed_kg(55 + n * 1.5),'ak',seed_kg(55 + n * 1.5),'ar','8'),
        jsonb_build_object('e','Romanian deadlift','s',3,'r','10','kg',seed_kg(50 + n * 1.25),'ak',seed_kg(50 + n * 1.25),'ar','10'),
        jsonb_build_object('e','Pull-up','s',4,'r','6','kg',case when n < 5 then 'BW' else '+' || seed_kg((n - 4) * 1.25) end,
                                                           'ak',case when n < 5 then 'BW' else '+' || seed_kg((n - 4) * 1.25) end,'ar','6'),
        jsonb_build_object('e','Plank','s',3,'r','45 s','ar','45 s')));
    end loop;
  end loop;

  n := 0;
  for w in reverse 6..1 loop
    -- Andreas: Mon / Wed / Fri 07:00, one missed session
    for i in 0..2 loop
      d := wk - 7 * w + i * 2; n := n + 1;
      st := case when w = 4 and i = 1 then 'no_show' else 'done' end;
      perform seed_session(t, c2, d, '07:00', 'strength', st, 'Studio', case when st = 'done' then jsonb_build_array(
        jsonb_build_object('e','Bench press','s',4,'r','8','kg',seed_kg(60 + n * 1),'ak',seed_kg(60 + n * 1),'ar','8'),
        jsonb_build_object('e','Back squat','s',4,'r','6','kg',seed_kg(80 + n * 1.25),'ak',seed_kg(80 + n * 1.25),'ar','6'),
        jsonb_build_object('e','Dumbbell row','s',3,'r','10','kg',seed_kg(24 + n * 0.5),'ak',seed_kg(24 + n * 0.5),'ar','10'),
        jsonb_build_object('e','Overhead press','s',3,'r','8','kg',seed_kg(35 + n * 0.5),'ak',seed_kg(35 + n * 0.5),'ar','8'))
        else '[]'::jsonb end);
    end loop;
  end loop;

  n := 0;
  for w in reverse 6..1 loop
    -- Chris: Tue 18:00 strength, Thu 19:00 conditioning, one late cancellation
    d := wk - 7 * w + 1; n := n + 1;
    perform seed_session(t, c6, d, '18:00', 'strength', 'done', 'Studio', jsonb_build_array(
      jsonb_build_object('e','Deadlift','s',3,'r','5','kg',seed_kg(110 + n * 2.5),'ak',seed_kg(110 + n * 2.5),'ar','5'),
      jsonb_build_object('e','Bench press','s',4,'r','6','kg',seed_kg(75 + n * 1.25),'ak',seed_kg(75 + n * 1.25),'ar','6'),
      jsonb_build_object('e','Pull-up','s',4,'r','8','kg','BW','ak','BW','ar',(6 + n / 2)::text)));
    perform seed_session(t, c6, wk - 7 * w + 3, '19:00', 'conditioning', case when w = 2 then 'late_cancel' else 'done' end, 'Park');
  end loop;

  n := 0;
  for w in reverse 6..1 loop
    -- Lena: Sat 10:00 glutes / legs
    n := n + 1;
    perform seed_session(t, c5, wk - 7 * w + 5, '10:00', 'strength', 'done', 'Studio', jsonb_build_array(
      jsonb_build_object('e','Hip thrust','s',4,'r','10','kg',seed_kg(60 + n * 5),'ak',seed_kg(60 + n * 5),'ar','10'),
      jsonb_build_object('e','Bulgarian split squat','s',3,'r','10','kg',seed_kg(10 + n * 1),'ak',seed_kg(10 + n * 1),'ar','10'),
      jsonb_build_object('e','Leg press','s',3,'r','12','kg',seed_kg(90 + n * 5),'ak',seed_kg(90 + n * 5),'ar','12')));
  end loop;

  for w in reverse 6..1 loop
    -- Maria: Tue 08:00 mobility, one cancelled in time
    perform seed_session(t, c3, wk - 7 * w + 1, '08:00', 'mobility', case when w = 3 then 'cancelled' else 'done' end, 'Studio',
      case when w = 3 then '[]'::jsonb else jsonb_build_array(
        jsonb_build_object('e','Goblet squat','s',3,'r','12','kg',seed_kg(12 + (7 - w)),'ak',seed_kg(12 + (7 - w)),'ar','12'),
        jsonb_build_object('e','Hip airplane','s',3,'r','6','ar','6')) end);
  end loop;

  -- ---------- This week (planned; past days show up under "past sessions to update") ----------
  perform seed_session(t, c2, wk + 0, '07:00', 'strength', 'planned', 'Studio');
  perform seed_session(t, c1, wk + 0, '17:30', 'strength', 'planned', 'Studio');
  perform seed_session(t, c3, wk + 1, '08:00', 'mobility', 'planned', 'Studio');
  perform seed_session(t, c6, wk + 1, '18:00', 'strength', 'planned', 'Studio');
  perform seed_session(t, c2, wk + 2, '07:00', 'strength', 'planned', 'Studio');
  perform seed_session(t, c4, wk + 2, '12:30', 'strength', 'planned', null, '[]', 'online');
  perform seed_session(t, c5, wk + 2, '18:00', 'strength', 'planned', 'Studio');
  perform seed_session(t, c1, wk + 3, '17:30', 'strength', 'planned', 'Studio');
  perform seed_session(t, c6, wk + 3, '19:00', 'conditioning', 'planned', 'Park');
  perform seed_session(t, c2, wk + 4, '07:00', 'strength', 'planned', 'Studio');
  perform seed_session(t, c5, wk + 5, '10:00', 'strength', 'planned', 'Studio');
  update sessions set meeting_url = 'https://zoom.us/j/0000000000' where client_id = c4;
  insert into sessions (trainer_id, client_id, starts_at, duration_min, kind, status, notes)
  values (t, null, ((wk + 4) + time '14:00') at time zone 'Asia/Nicosia', 120, 'own', 'planned', 'Admin / writing programs');

  -- ---------- Next week: Elena and Andreas already planned (kg left open where Kyri decides on the day) ----------
  perform seed_session(t, c1, wk + 7, '17:30', 'strength', 'planned', 'Studio', jsonb_build_array(
    jsonb_build_object('e','Back squat','s',5,'r','5','kg','75'),
    jsonb_build_object('e','Romanian deadlift','s',3,'r','8'),
    jsonb_build_object('e','Pull-up','s',4,'r','6','kg','+10'),
    jsonb_build_object('e','Copenhagen plank','s',3,'r','20 s')));
  perform seed_session(t, c2, wk + 7, '07:00', 'strength', 'planned', 'Studio', jsonb_build_array(
    jsonb_build_object('e','Bench press','s',5,'r','5'),
    jsonb_build_object('e','Back squat','s',4,'r','6','kg','100'),
    jsonb_build_object('e','Dumbbell row','s',3,'r','10','kg','34')));
  perform seed_session(t, c2, wk + 9, '07:00', 'strength', 'planned', null, '[]', 'online');
  update sessions set meeting_url = 'https://wa.me/' where client_id = c2 and format = 'online';
  perform seed_session(t, c3, wk + 8, '08:00', 'mobility', 'planned', 'Studio');
  perform seed_session(t, c6, wk + 8, '18:00', 'strength', 'planned', 'Studio');
  perform seed_session(t, c1, wk + 10, '17:30', 'strength', 'planned', 'Studio');
  perform seed_session(t, c5, wk + 12, '10:00', 'strength', 'planned', 'Studio');

  -- realistic pack counters (the trigger counted every past session)
  update clients set sessions_used = 7 where id = c1;
  update clients set sessions_used = 3 where id = c2;
  update clients set sessions_used = 2 where id = c3;
  update clients set sessions_used = 0 where id = c4;
  update clients set sessions_used = 4 where id = c5;
  update clients set sessions_used = 7 where id = c6;

  insert into session_notes (session_id, trainer_id, note)
  select id, t, 'Left knee a bit sensitive on deep squats, keep an eye on it.' from sessions
   where client_id = c1 and status = 'done' order by starts_at desc limit 1;

  -- ---------- Templates ----------
  insert into workout_templates (trainer_id, name, rows) values
    (t, 'Full body A', '[{"exercise":"Back squat","sets":4,"reps":"8"},{"exercise":"Bench press","sets":4,"reps":"8"},{"exercise":"Dumbbell row","sets":3,"reps":"10"},{"exercise":"Plank","sets":3,"reps":"45 s"}]'),
    (t, 'Lower body',  '[{"exercise":"Back squat","sets":5,"reps":"5"},{"exercise":"Romanian deadlift","sets":3,"reps":"8"},{"exercise":"Bulgarian split squat","sets":3,"reps":"10"},{"exercise":"Hip thrust","sets":3,"reps":"12"}]'),
    (t, 'Upper body',  '[{"exercise":"Bench press","sets":4,"reps":"6"},{"exercise":"Pull-up","sets":4,"reps":"6"},{"exercise":"Overhead press","sets":3,"reps":"8"},{"exercise":"Dumbbell row","sets":3,"reps":"10"}]');

  -- ---------- Online plan for Nikos: last week (done, with his kg) and this week ----------
  for i in 0..1 loop
    insert into plan_workouts (trainer_id, client_id, week_start, title, position, notes, completed_at, client_note)
    values (t, c4, wk - 7 * (1 - i), 'Day A · Lower body', 1, 'Warm up 10 min on the bike first.',
            case when i = 0 then now() - interval '6 days' end, case when i = 0 then 'Squats felt strong!' end)
    returning id into w_id;
    insert into exercise_rows (trainer_id, client_id, plan_workout_id, position, exercise, sets, reps, kg, actual_reps, actual_kg, done) values
      (t, c4, w_id, 1, 'Back squat',        4, '8',  case when i = 0 then '50' else '52.5' end, case when i = 0 then '8' end, case when i = 0 then '52.5' end, i = 0),
      (t, c4, w_id, 2, 'Romanian deadlift', 3, '10', case when i = 0 then '60' else '62.5' end, case when i = 0 then '10' end, case when i = 0 then '60' end, i = 0),
      (t, c4, w_id, 3, 'Walking lunges',    3, '12', '2×12', case when i = 0 then '12' end, case when i = 0 then '2×12' end, i = 0);
    insert into plan_workouts (trainer_id, client_id, week_start, title, position, completed_at)
    values (t, c4, wk - 7 * (1 - i), 'Day B · Upper body', 2, case when i = 0 then now() - interval '4 days' end)
    returning id into w_id;
    insert into exercise_rows (trainer_id, client_id, plan_workout_id, position, exercise, sets, reps, kg, actual_reps, actual_kg, done) values
      (t, c4, w_id, 1, 'Bench press',    4, '8',  case when i = 0 then '45' else '47.5' end, case when i = 0 then '8' end, case when i = 0 then '47.5' end, i = 0),
      (t, c4, w_id, 2, 'Dumbbell row',   3, '10', '20', case when i = 0 then '10' end, case when i = 0 then '22' end, i = 0),
      (t, c4, w_id, 3, 'Overhead press', 3, '8',  '25', case when i = 0 then '7' end, case when i = 0 then '25' end, i = 0);
  end loop;

  -- ---------- Client actions: a cancellation from the app and a pack request ----------
  update sessions set status = 'cancelled', cancelled_by = 'client', cancelled_at = now() - interval '2 hours'
   where client_id = c5 and status = 'planned' and starts_at between (wk + 5)::timestamp and (wk + 6)::timestamp;
  insert into renewal_requests (trainer_id, client_id, package_id, created_at)
  values (t, c6, p2w, now() - interval '3 hours');

  -- ---------- Payments ----------
  insert into payments (trainer_id, client_id, amount, method, status, paid_on, decided_at, reference) values
    (t, c4, 100, 'revolut', 'confirmed', current_date - 1,  now() - interval '1 day',  'Nikos Ioannou'),
    (t, c5, 450, 'cash',    'confirmed', current_date - 3,  now() - interval '3 days', 'Lena Hoffmann'),
    (t, c2, 280, 'revolut', 'confirmed', current_date - 19, now() - interval '19 days','Andreas Christou'),
    (t, c6, 280, 'bank',    'confirmed', current_date - 20, now() - interval '20 days','Chris Petrides'),
    (t, c1, 450, 'revolut', 'confirmed', current_date - 40, now() - interval '40 days','Elena Georgiou'),
    (t, c3, 150, 'cash',    'confirmed', current_date - 36, now() - interval '36 days','Maria Constantinou');
  insert into payments (trainer_id, client_id, amount, method, status, reported_at, reference)
    values (t, c6, 280, 'revolut', 'reported', now() - interval '11 hours', 'Chris Petrides');

  return t;
end $$;

revoke all on function public.seed_demo(text) from public, anon, authenticated;
revoke all on function public.seed_session(uuid, uuid, date, time, text, text, text, jsonb, text) from public, anon, authenticated;

-- ↓↓↓ The trainer admin's email ↓↓↓
select public.seed_demo('dillemc@hotmail.com');

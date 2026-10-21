-- ============================================================
-- Demo data (fake clients) for building and showing the app.
--
-- 1. Run 001_schema.sql and 003_training.sql first.
-- 2. Change the email in the LAST line to YOUR email, then run this file.
--
-- You become the trainer admin. The six demo clients get "plus" aliases
-- of your email (you+elena@…), so every client login link lands in your
-- own inbox and you can test the client app yourself.
--
-- Running it again wipes and recreates the demo trainer.
-- ============================================================

create or replace function public.seed_demo(admin_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t uuid;
  local_part text := split_part(admin_email, '@', 1);
  domain_part text := split_part(admin_email, '@', 2);
  p10 uuid; p1w uuid; p2w uuid; pon uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid;
  wk date := date_trunc('week', current_date)::date;   -- Monday of this week
  alias text;
  s_id uuid; w_id uuid; i int;
begin
  delete from trainers where slug = 'demo';

  insert into trainers (slug, brand_name, owner_name, tagline, account_name, iban, bic, revolut_url, default_lang)
  values ('demo', 'Train with Kyri', 'Kyriakos Nicolaou', 'Train with purpose.',
          'Kyriakos Nicolaou', 'CY17 0020 0128 0000 0012 0052 7600', 'BANKCY2N',
          'https://revolut.me/your-handle', 'en')
  returning id into t;

  insert into trainer_members (trainer_id, email) values (t, lower(admin_email));

  insert into packages (trainer_id, name, sessions, price, billing, sort) values
    (t, '10-session pack', 10, 450, 'pack', 1)    returning id into p10;
  insert into packages (trainer_id, name, sessions, price, billing, sort) values
    (t, 'Monthly 1x/week', 4, 150, 'monthly', 2)  returning id into p1w;
  insert into packages (trainer_id, name, sessions, price, billing, sort) values
    (t, 'Monthly 2x/week', 8, 280, 'monthly', 3)  returning id into p2w;
  insert into packages (trainer_id, name, sessions, price, billing, sort) values
    (t, 'Online coaching', null, 100, 'monthly', 4) returning id into pon;

  alias := local_part || '+';
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date)
    values (t, 'Elena Georgiou',     alias || 'elena@'   || domain_part, 'el', p10, 450, 'pack',    10, current_date + 3)  returning id into c1;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date)
    values (t, 'Andreas Christou',   alias || 'andreas@' || domain_part, 'el', p2w, 280, 'monthly',  8, current_date + 11) returning id into c2;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date)
    values (t, 'Maria Constantinou', alias || 'maria@'   || domain_part, 'en', p1w, 150, 'monthly',  4, current_date - 6)  returning id into c3;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date)
    values (t, 'Nikos Ioannou',      alias || 'nikos@'   || domain_part, 'en', pon, 100, 'monthly', null, current_date + 29) returning id into c4;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date)
    values (t, 'Lena Hoffmann',      alias || 'lena@'    || domain_part, 'de', p10, 450, 'pack',    10, null)               returning id into c5;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date)
    values (t, 'Chris Petrides',     alias || 'chris@'   || domain_part, 'en', p2w, 280, 'monthly',  8, current_date + 10) returning id into c6;

  -- Sessions: negative day = past (done, counted against the pack by the trigger),
  -- 0–10 = this week and next week (planned). Times are Cyprus time.
  insert into sessions (trainer_id, client_id, starts_at, kind, status, location)
  select t, s.c, ((wk + s.d) + s.tm) at time zone 'Asia/Nicosia', s.k,
         case when s.d < 0 then 'done' else 'planned' end, s.loc
  from (values
    (c1, -14, time '17:30', 'strength', 'Studio'), (c1, -12, time '17:30', 'strength', 'Studio'),
    (c1, -10, time '17:30', 'strength', 'Studio'), (c1, -7,  time '17:30', 'strength', 'Studio'),
    (c1, -5,  time '17:30', 'strength', 'Studio'), (c1, -3,  time '10:00', 'mobility', 'Studio'),
    (c1, -1,  time '10:00', 'strength', 'Studio'),
    (c2, -7,  time '07:00', 'strength', 'Studio'), (c2, -5,  time '07:00', 'strength', 'Studio'),
    (c2, -3,  time '07:00', 'strength', 'Studio'),
    (c3, -13, time '08:00', 'mobility', 'Studio'), (c3, -6,  time '08:00', 'mobility', 'Studio'),
    (c5, -9,  time '10:00', 'strength', 'Studio'), (c5, -2,  time '10:00', 'strength', 'Studio'),
    (c6, -13, time '18:00', 'strength', 'Studio'), (c6, -11, time '19:00', 'conditioning', 'Park'),
    (c6, -8,  time '18:00', 'strength', 'Studio'), (c6, -6,  time '18:00', 'strength', 'Studio'),
    (c6, -4,  time '19:00', 'conditioning', 'Park'), (c6, -3, time '18:00', 'strength', 'Studio'),
    (c6, -1,  time '19:00', 'conditioning', 'Park'),
    (c2, 0, time '07:00', 'strength', 'Studio'), (c1, 0, time '17:30', 'strength', 'Studio'),
    (c3, 1, time '08:00', 'mobility', 'Studio'), (c6, 1, time '18:00', 'strength', 'Studio'),
    (c2, 2, time '07:00', 'strength', 'Studio'), (c4, 2, time '12:30', 'strength', 'Zoom'),
    (c5, 2, time '18:00', 'mobility', 'Studio'),
    (c1, 3, time '17:30', 'strength', 'Studio'), (c6, 3, time '19:00', 'conditioning', 'Park'),
    (c2, 4, time '07:00', 'strength', 'Studio'), (c5, 5, time '10:00', 'strength', 'Studio'),
    (c2, 7, time '07:00', 'strength', 'Studio'), (c1, 7, time '17:30', 'strength', 'Studio'),
    (c3, 8, time '08:00', 'mobility', 'Studio'), (c2, 9, time '07:00', 'strength', 'Studio'),
    (c1, 10, time '17:30', 'strength', 'Studio')
  ) as s(c, d, tm, k, loc);

  -- Modes: Nikos online (check-in today), Andreas hybrid
  update clients set mode = 'online', checkin_weekday = extract(isodow from current_date)::int where id = c4;
  update clients set mode = 'hybrid', checkin_weekday = 7 where id = c2;
  update sessions set format = 'online', meeting_url = 'https://zoom.us/j/0000000000' where client_id = c4 or location = 'Zoom';
  update sessions set format = 'online', location = null, meeting_url = 'https://wa.me/' where client_id = c2 and starts_at::date = wk + 9;

  -- Training log for Elena's past gym sessions (weights go up over time)
  i := 0;
  for s_id in select id from sessions where client_id = c1 and status = 'done' order by starts_at loop
    insert into exercise_rows (trainer_id, client_id, session_id, position, exercise, sets, reps, kg) values
      (t, c1, s_id, 1, 'Back squat',        4, '8',  regexp_replace((55 + i * 2.5)::text, '\.0$', '')),
      (t, c1, s_id, 2, 'Romanian deadlift', 3, '10', regexp_replace((50 + i * 2.5)::text, '\.0$', '')),
      (t, c1, s_id, 3, 'Pull-up',           4, '6',  case when i < 3 then 'BW' else '+' || regexp_replace(((i - 2) * 2.5)::text, '\.0$', '') end),
      (t, c1, s_id, 4, 'Plank',             3, '45 s', null);
    i := i + 1;
  end loop;
  insert into session_notes (session_id, trainer_id, note)
  select id, t, 'Left knee a bit sensitive on deep squats, keep an eye on it.' from sessions
   where client_id = c1 and status = 'done' order by starts_at desc limit 1;

  -- Online plan for Nikos: last week (done, with his actual kg) and this week
  for i in 0..1 loop
    insert into plan_workouts (trainer_id, client_id, week_start, title, position, notes, completed_at, client_note)
    values (t, c4, wk - 7 * (1 - i), 'Day A · Lower body', 1, 'Warm up 10 min on the bike first.',
            case when i = 0 then now() - interval '6 days' end, case when i = 0 then 'Squats felt strong!' end)
    returning id into w_id;
    insert into exercise_rows (trainer_id, client_id, plan_workout_id, position, exercise, sets, reps, kg, actual_reps, actual_kg, done) values
      (t, c4, w_id, 1, 'Back squat',        4, '8',  case when i = 0 then '50' else '52.5' end, case when i = 0 then '8' end, case when i = 0 then '52.5' end, i = 0),
      (t, c4, w_id, 2, 'Romanian deadlift', 3, '10', case when i = 0 then '60' else '62.5' end, case when i = 0 then '10' end, case when i = 0 then '60' end, i = 0),
      (t, c4, w_id, 3, 'Walking lunges',    3, '12', '2×12', case when i = 0 then '12' end, case when i = 0 then '2×12' end, i = 0);
    insert into plan_workouts (trainer_id, client_id, week_start, title, position, notes, completed_at)
    values (t, c4, wk - 7 * (1 - i), 'Day B · Upper body', 2, null, case when i = 0 then now() - interval '4 days' end)
    returning id into w_id;
    insert into exercise_rows (trainer_id, client_id, plan_workout_id, position, exercise, sets, reps, kg, actual_reps, actual_kg, done) values
      (t, c4, w_id, 1, 'Bench press',     4, '8',  case when i = 0 then '45' else '47.5' end, case when i = 0 then '8' end, case when i = 0 then '47.5' end, i = 0),
      (t, c4, w_id, 2, 'Dumbbell row',    3, '10', '20', case when i = 0 then '10' end, case when i = 0 then '22' end, i = 0),
      (t, c4, w_id, 3, 'Overhead press',  3, '8',  '25', case when i = 0 then '7' end, case when i = 0 then '25' end, i = 0);
  end loop;

  insert into sessions (trainer_id, client_id, starts_at, duration_min, kind, status, notes)
  values (t, null, ((wk + 4) + time '14:00') at time zone 'Asia/Nicosia', 120, 'own', 'planned', 'Admin / writing programs');

  -- Payments
  insert into payments (trainer_id, client_id, amount, method, status, paid_on, decided_at, reference) values
    (t, c4, 100, 'revolut', 'confirmed', current_date - 1,  now() - interval '1 day',  'Nikos Ioannou'),
    (t, c5, 450, 'cash',    'confirmed', current_date - 3,  now() - interval '3 days', 'Lena Hoffmann'),
    (t, c2, 280, 'revolut', 'confirmed', current_date - 19, now() - interval '19 days','Andreas Christou'),
    (t, c6, 280, 'bank',    'confirmed', current_date - 20, now() - interval '20 days','Chris Petrides');
  insert into payments (trainer_id, client_id, amount, method, status, reported_at, reference)
    values (t, c6, 280, 'revolut', 'reported', now() - interval '11 hours', 'Chris Petrides');

  return t;
end $$;

revoke all on function public.seed_demo(text) from public, anon, authenticated;

-- ↓↓↓ Put your own email here ↓↓↓
select public.seed_demo('dillemc@hotmail.com');

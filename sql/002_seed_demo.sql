-- ============================================================
-- Demo data (fake clients) for building and showing the app.
--
-- 1. Run 001 and 003 – 012 first.
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
--   • v2: programs (Marios from Kyri's notes, Elena, Andreas, Nikos online), kg history,
--     exercise notes/videos, Nikos' online session from yesterday, PAR-Q answers
--     (Sofia flagged, Elena not yet → she sees PAR-Q + rules at her first login),
--     rules, Elena on her last pack session, two archived clients
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

-- helper: a program with days. days = [{title, focus, note, blocks}]
create or replace function public.seed_program(p_t uuid, p_c uuid, p_title text, p_days jsonb)
returns uuid language plpgsql as $$
declare pid uuid; d jsonb; i int := 0;
begin
  insert into programs (trainer_id, client_id, title) values (p_t, p_c, p_title) returning id into pid;
  for d in select * from jsonb_array_elements(p_days) loop
    i := i + 1;
    insert into program_days (program_id, trainer_id, position, title, focus, note, blocks)
    values (pid, p_t, i, coalesce(d->>'title', 'Day ' || i), d->>'focus', d->>'note', coalesce(d->'blocks', '[]'));
  end loop;
  return pid;
end $$;

-- helper: id of day n of a client's program
create or replace function public.seed_day(p_c uuid, p_n int) returns uuid language sql stable as $$
  select d.id from program_days d join programs p on p.id = d.program_id where p.client_id = p_c and d.position = p_n
$$;

create or replace function public.seed_demo(admin_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t uuid;
  domain_part text := split_part(admin_email, '@', 2);
  alias text := split_part(admin_email, '@', 1) || '+';
  p10 uuid; p1w uuid; p2w uuid; pon uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid;
  c7 uuid; c8 uuid; c9 uuid; c10 uuid; sid uuid; wid uuid; k int; seq int[]; nexts int;
  ans jsonb; q jsonb;
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

  -- Kyri already ticked most of this week; only Elena's and Chris' last ones are still open
  update sessions set status = 'done' where trainer_id = t and status = 'planned' and client_id is not null
     and client_id not in (c1, c6) and starts_at < now() - interval '20 hours';

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


  -- ============================================================
  -- v2.0: programs, kg history, online sessions, PAR-Q, rules, archive
  -- ============================================================
  update trainers set reminder_days = 2,
    rules_text = E'• Free cancellation until 24 hours before your session.\n• Later cancellations or no-shows count as a session from your pack.\n• Packs are valid for 8 weeks.\n• Please bring a towel and water.',
    parq_questions = parq_questions || '[{"q":"What are your main goals for the next 3 months?","type":"text","flag":false}]'::jsonb
  where id = t;

  -- new clients: Marios (program from Kyri's notes), Sofia (new, flagged PAR-Q), two archived
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date, mode)
    values (t, 'Marios Demetriou', alias || 'marios@' || domain_part, 'el', p10, 450, 'pack', 10, null, 'gym') returning id into c7;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date, mode)
    values (t, 'Sofia Andreou',    alias || 'sofia@'  || domain_part, 'el', p10, 450, 'pack', 10, null, 'gym') returning id into c8;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date, mode, active, archived_at)
    values (t, 'Petros Kyprianou', alias || 'petros@' || domain_part, 'el', p1w, 150, 'monthly', 4, null, 'gym', false, now() - interval '40 days') returning id into c9;
  insert into clients (trainer_id, name, email, lang, package_id, price, billing, sessions_total, next_due_date, mode, active, archived_at)
    values (t, 'Anna Michael',     alias || 'anna@'   || domain_part, 'en', p10, 450, 'pack', 10, null, 'gym', false, now() - interval '75 days') returning id into c10;

  -- ---------- Exercise library: notes + videos, reused in every program ----------
  insert into exercise_library (trainer_id, name, note, video_type, video_url) values
    (t, 'Deadlift',             'Brace hard, bar close to the shins, push the floor away.', 'yt', 'https://www.youtube.com/results?search_query=conventional+deadlift+technique'),
    (t, 'DB Shoulder Press',    'Ribs down, don''t lean back.', null, null),
    (t, 'Step Up + Knee Drive', null, 'yt', 'https://www.youtube.com/results?search_query=step+up+knee+drive+technique'),
    (t, 'KB Swing',             'Hips, not arms. Snap at the top.', 'yt', 'https://www.youtube.com/results?search_query=kettlebell+swing+technique'),
    (t, 'Smith Squat',          'Feet slightly in front of the bar, sit straight down.', null, null),
    (t, 'Goblet Squat',         'Elbows inside the knees, chest up.', 'yt', 'https://www.youtube.com/results?search_query=goblet+squat+technique'),
    (t, 'Back squat',           'Knees out, full depth only if the back stays neutral.', null, null),
    (t, 'Romanian deadlift',    'Soft knees, push the hips back, bar slides down the thighs.', 'yt', 'https://www.youtube.com/results?search_query=romanian+deadlift+technique'),
    (t, 'Walking lunges',       'Long step, back knee kisses the floor.', null, null),
    (t, 'Push Ups',             'Body in one line, chest to the floor.', null, null);

  -- ---------- Programs ----------
  -- Marios: exactly Kyri's notes (paste import)
  perform seed_program(t, c7, 'Marios Demetriou Program', $j$[
    {"title":"Day 1","focus":"Strength + Power","blocks":[
      {"type":"single","items":[{"exercise":"Smith Squat","rx":"3×8"}]},
      {"type":"single","items":[{"exercise":"DB Romanian Deadlift","rx":"3×10"}]},
      {"type":"single","items":[{"exercise":"DB Bench Press","rx":"3×8–10"}]},
      {"type":"single","items":[{"exercise":"Medicine Ball Slam","rx":"3×8"}]},
      {"type":"superset","rounds":3,"items":[{"exercise":"TRX Row","rx":"×10"},{"exercise":"Medicine Ball Chest Throw","rx":"×8"}]},
      {"type":"single","items":[{"exercise":"Sled Push","rx":"4×20m"}]},
      {"type":"single","items":[{"exercise":"Farmer Carry","rx":"3×30m"}]}]},
    {"title":"Day 2","focus":"Explosiveness + Conditioning","blocks":[
      {"type":"single","items":[{"exercise":"Deadlift","rx":"3×10","target":110}]},
      {"type":"single","items":[{"exercise":"DB Shoulder Press","rx":"3×8–10"}]},
      {"type":"single","items":[{"exercise":"Step Up + Knee Drive","rx":"3×8/leg"}]},
      {"type":"single","items":[{"exercise":"KB Swing","rx":"3×12"}]},
      {"type":"superset","rounds":3,"items":[{"exercise":"Push Ups","rx":"×10"},{"exercise":"Smash Ball Wall Throw","rx":"×8"}]},
      {"type":"single","items":[{"exercise":"Sled Pull","rx":"3×20m"}]},
      {"type":"single","items":[{"exercise":"Row","rx":"3×200m"}]},
      {"type":"finisher","rounds":5,"lines":["Assault Bike — 30 sec","Rest — 30 sec"]}]},
    {"title":"Day 3","focus":"Full body + Fighter conditioning","blocks":[
      {"type":"single","items":[{"exercise":"Goblet Squat","rx":"3×10"}]},
      {"type":"single","items":[{"exercise":"1-Arm DB Row","rx":"3×10/side"}]},
      {"type":"single","items":[{"exercise":"DB Incline Press","rx":"3×8–10"}]},
      {"type":"single","items":[{"exercise":"KB Clean + Push Press","rx":"3×6/side"}]}]}
  ]$j$);

  perform seed_program(t, c1, 'Elena · Strength block', $j$[
    {"title":"Day 1","focus":"Lower body","blocks":[
      {"type":"single","items":[{"exercise":"Back squat","rx":"4×8"}]},
      {"type":"single","items":[{"exercise":"Romanian deadlift","rx":"3×10"}]},
      {"type":"superset","rounds":3,"items":[{"exercise":"Walking lunges","rx":"×12"},{"exercise":"Plank","rx":"45 sec"}]}]},
    {"title":"Day 2","focus":"Upper body + Pull","blocks":[
      {"type":"single","items":[{"exercise":"Pull-up","rx":"4×6"}]},
      {"type":"single","items":[{"exercise":"DB Bench Press","rx":"3×10"}]},
      {"type":"single","items":[{"exercise":"1-Arm DB Row","rx":"3×10/side"}]}]}
  ]$j$);

  perform seed_program(t, c2, 'Andreas · Hybrid', $j$[
    {"title":"Day 1","focus":"Push","note":"Warm up 10 min on the bike first.","blocks":[
      {"type":"single","items":[{"exercise":"Bench press","rx":"4×8"}]},
      {"type":"single","items":[{"exercise":"Overhead press","rx":"3×8"}]},
      {"type":"superset","rounds":3,"items":[{"exercise":"Push Ups","rx":"×12"},{"exercise":"DB Lateral Raise","rx":"×15"}]}]},
    {"title":"Day 2","focus":"Legs","blocks":[
      {"type":"single","items":[{"exercise":"Back squat","rx":"4×6"}]},
      {"type":"single","items":[{"exercise":"Romanian deadlift","rx":"3×10"}]},
      {"type":"single","items":[{"exercise":"Walking lunges","rx":"3×12"}]}]},
    {"title":"Day 3","focus":"Pull","blocks":[
      {"type":"single","items":[{"exercise":"Dumbbell row","rx":"3×10"}]},
      {"type":"single","items":[{"exercise":"Pull-up","rx":"4×6"}]}]}
  ]$j$);

  perform seed_program(t, c4, 'Nikos · Online fat loss + strength', $j$[
    {"title":"Day 1","focus":"Lower body","note":"Warm up 10 min on the bike. Last set of squats: leave 1–2 reps in the tank.","blocks":[
      {"type":"single","items":[{"exercise":"Goblet Squat","rx":"4×10"}]},
      {"type":"single","items":[{"exercise":"Romanian deadlift","rx":"3×10"}]},
      {"type":"superset","rounds":3,"items":[{"exercise":"Walking lunges","rx":"×12"},{"exercise":"KB Swing","rx":"×15"}]},
      {"type":"finisher","rounds":5,"lines":["Assault Bike — 30 sec","Rest — 30 sec"]}]},
    {"title":"Day 2","focus":"Upper body","note":"Slow on the way down (3 sec) on every press.","blocks":[
      {"type":"single","items":[{"exercise":"DB Bench Press","rx":"4×8–10"}]},
      {"type":"single","items":[{"exercise":"1-Arm DB Row","rx":"3×10/side"}]},
      {"type":"single","items":[{"exercise":"DB Shoulder Press","rx":"3×10"}]},
      {"type":"superset","rounds":3,"items":[{"exercise":"Push Ups","rx":"×10"},{"exercise":"Plank","rx":"40 sec"}]}]},
    {"title":"Day 3","focus":"Full body conditioning","blocks":[
      {"type":"single","items":[{"exercise":"Deadlift","rx":"3×8"}]},
      {"type":"single","items":[{"exercise":"Step Up + Knee Drive","rx":"3×8/leg"}]},
      {"type":"finisher","rounds":4,"lines":["KB Swing ×15","Push Ups ×10","Rest — 60 sec"]}]}
  ]$j$);

  -- ---------- Marios: 11 sessions over 5 weeks (Tue + Fri 18:00), logged by Kyri ----------
  seq := array[1,2,3,1,2,3,1,2,3,1,2];
  for k in 1..11 loop
    d := current_date - 38 + ((k - 1) / 2) * 7 + case when k % 2 = 1 then 1 else 4 end;
    sid := seed_session(t, c7, d, '18:00', 'strength', 'done', 'Studio');
    insert into exercise_logs (trainer_id, client_id, day_id, session_id, exercise, kg, reps, source, logged_on)
    select t, c7, seed_day(c7, seq[k]), sid, x.e, x.kg, x.r, 'trainer', d
    from (values
      (1, 'Smith Squat',          (array[30,32.5,35,40])[(k + 2) / 3], '8'),
      (1, 'DB Romanian Deadlift', (array[17.5,20,20,22])[(k + 2) / 3], '10'),
      (1, 'DB Bench Press',       (array[12.5,14,15,15])[(k + 2) / 3], '9'),
      (2, 'Deadlift',             (array[60,70,80,90])[(k + 1) / 3], '10'),
      (2, 'DB Shoulder Press',    (array[10,10,12.5,15])[(k + 1) / 3], '8'),
      (2, 'KB Swing',             (array[16,16,20,20])[(k + 1) / 3], '12'),
      (3, 'Goblet Squat',         (array[20,22,24])[k / 3], '10'),
      (3, '1-Arm DB Row',         (array[20,22,24])[k / 3], '10')
    ) x(dy, e, kg, r) where x.dy = seq[k];
  end loop;
  -- next for Marios: Day 3 · today 18:00
  perform seed_session(t, c7, current_date, '18:00', 'strength', 'planned', 'Studio');
  perform seed_session(t, c7, current_date + 4, '18:00', 'strength', 'planned', 'Studio');

  -- Elena + Andreas: their earlier gym logs become kg history for the new program view
  insert into exercise_logs (trainer_id, client_id, session_id, day_id, exercise, kg, reps, source, logged_on)
  select r.trainer_id, r.client_id, r.session_id,
         seed_day(r.client_id, case when r.client_id = c1 then case when extract(isodow from s.starts_at at time zone 'Asia/Nicosia') = 1 then 1 else 2 end
                                    else (extract(isodow from s.starts_at at time zone 'Asia/Nicosia')::int + 1) / 2 end),
         r.exercise, nullif(regexp_replace(coalesce(r.actual_kg, r.kg), '[^0-9.]', '', 'g'), '')::numeric, r.actual_reps, 'trainer',
         (s.starts_at at time zone 'Asia/Nicosia')::date
  from exercise_rows r join sessions s on s.id = r.session_id
  where s.status = 'done' and r.client_id in (c1, c2) and coalesce(r.actual_kg, r.kg) ~ '^[0-9.]+$';

  -- ---------- Nikos online: Day 1/2/3 last week, Day 1 yesterday → Day 2 is next ----------
  for k in 1..4 loop
    d := case k when 1 then current_date - 8 when 2 then current_date - 6 when 3 then current_date - 4 else current_date - 1 end;
    nexts := case when k = 4 then 1 else k end;
    insert into workout_logs (trainer_id, client_id, day_id, day_title, minutes, note, finished_at)
    values (t, c4, seed_day(c4, nexts), 'Day ' || nexts, (array[52,45,38,48])[k],
            case k when 4 then 'Felt strong. KB swings were hard on the last round, squats 2 kg up!' when 2 then 'Shoulder a bit tight on the press.' end,
            (d + time '19:10') at time zone 'Asia/Nicosia')
    returning id into wid;
    insert into exercise_logs (trainer_id, client_id, day_id, workout_log_id, exercise, kg, reps, source, logged_on)
    select t, c4, seed_day(c4, nexts), wid, x.e, x.kg, x.r, 'client', d
    from (values
      (1, 'Goblet Squat', case when k = 4 then 22 else 20 end, '10'),
      (1, 'Romanian deadlift', case when k = 4 then 45 else 40 end, '10'),
      (1, 'KB Swing', 16::numeric, '15'),
      (2, 'DB Bench Press', 18::numeric, '9'),
      (2, '1-Arm DB Row', 20::numeric, '10'),
      (2, 'DB Shoulder Press', 10::numeric, '10'),
      (3, 'Deadlift', 70::numeric, '8')
    ) x(dy, e, kg, r) where x.dy = nexts;
  end loop;
  update clients set sessions_used = 0 where id = c4;
  perform seed_session(t, c4, current_date + 3, '12:30', 'strength', 'planned', null, '[]', 'online');
  update sessions set meeting_url = 'https://zoom.us/j/0000000000' where client_id = c4 and meeting_url is null;

  -- v3.1: real vs planned duration, and comments per exercise from Nikos
  update workout_logs set seconds = minutes * 60 + 23, planned_minutes = 40 where client_id = c4;
  update exercise_logs set note = 'Last round felt heavy, lower back a bit tight.'
   where client_id = c4 and exercise = 'KB Swing' and workout_log_id = (select id from workout_logs where client_id = c4 order by finished_at desc limit 1);
  update exercise_logs set note = 'Easy, can go up next time.'
   where client_id = c4 and exercise = 'Goblet Squat' and workout_log_id = (select id from workout_logs where client_id = c4 order by finished_at desc limit 1);

  -- ---------- Sofia (new) + archived clients ----------
  perform seed_session(t, c8, current_date + 3, '09:00', 'strength', 'planned', 'Studio');
  for k in 1..4 loop
    perform seed_session(t, c9, current_date - 70 - k * 7, '07:30', 'strength', 'done', 'Studio');
    perform seed_session(t, c10, current_date - 100 - k * 7, '11:00', 'strength', 'done', 'Studio');
  end loop;
  update clients set sessions_used = 0 where id = c8;
  update clients set sessions_used = 4 where id = c9;
  update clients set sessions_used = 10 where id = c10;
  insert into payments (trainer_id, client_id, amount, method, status, paid_on, decided_at, reference) values
    (t, c7, 450, 'revolut', 'confirmed', current_date - 12, now() - interval '12 days', 'Marios Demetriou'),
    (t, c8, 450, 'cash',    'confirmed', current_date,      now(),                     'Sofia Andreou'),
    (t, c9, 150, 'bank',    'confirmed', current_date - 98, now() - interval '98 days','Petros Kyprianou'),
    (t, c10,450, 'revolut', 'confirmed', current_date - 140,now() - interval '140 days','Anna Michael');
  update clients set sessions_used = 5 where id = c7;

  -- ---------- PAR-Q answers + rules (Elena has none yet → onboarding at her first login) ----------
  select parq_questions into q from trainers where id = t;
  for sid, d in select id, (created_at - interval '1 day' * (10 + (ascii(name) % 40)))::date from clients
                 where trainer_id = t and id not in (c1, c8) loop
    select jsonb_agg(e || case when e->>'type' = 'yn' then jsonb_build_object('answer', false)
                               else jsonb_build_object('text', 'Get stronger and lose a few kilos.') end)
      into ans from jsonb_array_elements(q) e;
    insert into parq_responses (trainer_id, client_id, answers, signed_name, flagged, reviewed_at, created_at)
    select t, sid, ans, name, false, d + time '12:00', d + time '10:00' from clients where id = sid;
    update clients set parq_at = d + time '10:00', rules_accepted_at = d + time '10:02' where id = sid;
  end loop;
  select jsonb_agg(e || case when e->>'type' = 'text' then jsonb_build_object('text', 'Get back to running and build strength after my knee surgery.')
                             else jsonb_build_object('answer', (o = 5)) end order by o)
    into ans from jsonb_array_elements(q) with ordinality x(e, o);
  insert into parq_responses (trainer_id, client_id, answers, explanation, signed_name, flagged, created_at)
  values (t, c8, ans, 'Knee surgery (ACL) in 2024, cleared by my doctor for training.', 'Sofia Andreou', true, now() - interval '2 hours');
  update clients set parq_at = now() - interval '2 hours', rules_accepted_at = now() - interval '2 hours' where id = c8;

  -- ---------- Program days assigned to booked sessions (Kyri does this in the calendar or the program) ----------
  update sessions set program_day_id = seed_day(c7, 3) where client_id = c7 and status = 'planned' and (starts_at at time zone 'Asia/Nicosia')::date = current_date;
  update sessions set program_day_id = seed_day(c7, 1) where client_id = c7 and status = 'planned' and (starts_at at time zone 'Asia/Nicosia')::date = current_date + 4;
  update sessions set program_day_id = seed_day(c2, 1) where client_id = c2 and status = 'planned' and starts_at >= (wk + 7)::timestamp and starts_at < (wk + 8)::timestamp;
  update sessions set program_day_id = seed_day(c2, 2) where client_id = c2 and status = 'planned' and starts_at >= (wk + 9)::timestamp and starts_at < (wk + 10)::timestamp;
  update sessions set program_day_id = seed_day(c4, 3) where client_id = c4 and status = 'planned' and starts_at > now();

  -- ---------- Elena: exactly one session left in her pack → reminder ----------
  if not exists (select 1 from sessions where client_id = c1 and status = 'planned'
                 and starts_at between now() and (current_date + 3)::timestamp at time zone 'Asia/Nicosia') then
    perform seed_session(t, c1, current_date + 2, '10:00', 'strength', 'planned', 'Studio');
  end if;
  update clients set sessions_used = 10 - 1 - (select count(*) from sessions where client_id = c1 and status = 'planned' and starts_at < now())
   where id = c1;
  update sessions set program_day_id = seed_day(c1, 1)
   where id = (select id from sessions where client_id = c1 and status = 'planned' and starts_at > now() order by starts_at limit 1);

  return t;
end $$;

revoke all on function public.seed_demo(text) from public, anon, authenticated;
revoke all on function public.seed_session(uuid, uuid, date, time, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.seed_program(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.seed_day(uuid, int) from public, anon, authenticated;

-- ↓↓↓ The trainer admin's email ↓↓↓
select public.seed_demo('dillemc@hotmail.com');

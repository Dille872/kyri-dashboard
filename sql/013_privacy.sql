-- ============================================================
-- v4.0.0 – Going live: privacy notice, explicit consent for health data (PAR-Q),
-- contact e-mail for privacy questions. Run once in Supabase → SQL Editor (after 012). Safe to run again.
-- ============================================================

alter table public.trainers add column if not exists contact_email text;
alter table public.trainers add column if not exists privacy_text text;          -- empty = the app's standard text
alter table public.parq_responses add column if not exists consent_at timestamptz;

-- PAR-Q now needs the client's explicit consent to store health answers (GDPR art. 9)
drop function if exists public.submit_parq(uuid, jsonb, text, text);
create or replace function public.submit_parq(p_client uuid, p_answers jsonb, p_explanation text, p_name text, p_consent boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare c clients; flag boolean;
begin
  select * into c from my_active_client(p_client);
  if c.id is null then raise exception 'not allowed'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;
  if not coalesce(p_consent, false) then raise exception 'consent required'; end if;
  select exists (select 1 from jsonb_array_elements(p_answers) a where a->>'type' = 'yn' and (a->>'flag')::boolean and (a->>'answer')::boolean)
    into flag;
  insert into parq_responses (trainer_id, client_id, answers, explanation, signed_name, flagged, consent_at)
  values (c.trainer_id, c.id, p_answers, nullif(trim(p_explanation), ''), trim(p_name), flag, now());
  update clients set parq_at = now() where id = c.id;
end $$;
grant execute on function public.submit_parq(uuid, jsonb, text, text, boolean) to authenticated;

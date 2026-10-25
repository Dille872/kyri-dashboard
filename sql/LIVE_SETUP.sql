-- ============================================================
-- Kyri's LIVE system: run ONCE in the NEW (live) Supabase project,
-- after 001 and 003 – 013. Do NOT run 002_seed_demo.sql there (that is only for the demo).
-- Check the two e-mails below, then Run.
-- ============================================================

insert into public.trainers (slug, brand_name, owner_name, tagline, default_lang, contact_email, cancel_hours, reminder_days)
values ('kyri', 'Train with Kyri', 'Kyriakos Nicolaou', 'Train like a fighter.', 'en', 'trainwithkyri1@outlook.com', 24, 2)
on conflict (slug) do nothing;

-- who may open the trainer side (Kyri; add yourself as a second line if you want to help him)
insert into public.trainer_members (trainer_id, email)
select id, 'trainwithkyri1@outlook.com' from public.trainers where slug = 'kyri'
on conflict do nothing;

-- standard rules to start with (Kyri changes them in Settings)
update public.trainers set rules_text = E'• Free cancellation until 24 hours before your session.\n• Later cancellations or no-shows count as a session from your pack.\n• Packs are valid for 8 weeks.\n• Please bring a towel and water.'
where slug = 'kyri' and rules_text is null;

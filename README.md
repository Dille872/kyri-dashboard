# Train with Kyri – Coach Dashboard (v4.2.0)

Web-App für Trainer und Klienten: Kalender, Klienten mit Paketen, Zahlungen (Revolut, Überweisung, Bar) und eine Client-App für das Handy. Sprachen: Englisch, Griechisch, Deutsch.

Stack wie beim Agentur-Dashboard: Vite + React + Supabase, Hosting auf Vercel.

---

## 1. Supabase-Projekt anlegen (einmalig, ~10 Min.)

1. Auf supabase.com ein **neues Projekt** anlegen, z. B. `kyri-dashboard` (getrennt vom Agentur-Dashboard). Region: Frankfurt.
2. **SQL Editor** → Inhalt von `sql/001_schema.sql` einfügen → Run.
3. **SQL Editor** → Inhalt von `sql/003_training.sql` einfügen → Run, danach `sql/004_counting.sql` → Run, danach `sql/005_planning.sql` → Run, danach `sql/006_client_actions.sql` → Run, danach `sql/007_programs.sql` → Run, danach `sql/008_storage.sql` → Run (für eigene Videos), danach `sql/009_session_days.sql` → Run, danach `sql/010_russian.sql` → Run, danach `sql/011_client_stats.sql` → Run, danach `sql/012_session_comments.sql` → Run.
4. **SQL Editor** → Inhalt von `sql/002_seed_demo.sql` einfügen, **in der letzten Zeile deine E-Mail eintragen** → Run.
   - Du wirst Trainer-Admin.
   - Die 6 Fake-Klienten bekommen Aliase deiner E-Mail (z. B. `du+elena@…`). Ihre Login-Mails landen also bei dir. So kannst du die Client-App selbst testen.
5. **Authentication → URL Configuration**: Site URL `http://localhost:5173` (später die Vercel-Domain) und dieselbe Adresse unter Redirect URLs.
6. **Später (mit eigenem SMTP, z. B. Resend):** Authentication → Emails → Magic Link um den Code ergänzen, damit Login auch in der Home-Bildschirm-App klappt. Ohne eigenes SMTP lässt Supabase die Vorlage nicht bearbeiten und schickt Mails nur an Mitglieder deines Supabase-Teams:
   ```html
   <h2>Your sign-in link</h2>
   <p><a href="{{ .ConfirmationURL }}">Sign in</a></p>
   <p>Or enter this code: <strong>{{ .Token }}</strong></p>
   ```
   (Grund: Auf dem iPhone hat eine Web-App auf dem Home-Bildschirm einen eigenen Speicher. Der Link öffnet Safari, der Code funktioniert direkt in der App.)

## 2. Lokal starten

```bash
cd ~/Downloads/kyri-dashboard
cp .env.example .env.local     # URL + anon key aus Supabase → Project Settings → API eintragen
npm install
npm run dev
```

Dann http://localhost:5173 öffnen, mit deiner E-Mail anmelden → Trainer-Ansicht.

**Client-Ansicht testen (ohne Mails):** In Supabase → Authentication → Users → *Add user* → *Create new user*:
E-Mail `du+elena@…` (genau wie im Seed), ein Passwort, *Auto Confirm User* anhaken.
Seit v4.2.0 gibt es den Login mit E-Mail + Passwort für alle (die Variable `VITE_PASSWORD_LOGIN` wird nicht mehr gebraucht).
In einem privaten Fenster damit anmelden → Client-Ansicht. Für die Live-Version diese Zeile weglassen.

## 3. Online stellen (Vercel)

1. Neues **privates GitHub-Repo** `kyri-dashboard`, Ordner pushen.
2. Auf vercel.com: Add New → Project → Repo wählen. Framework: Vite (erkennt es selbst).
3. Environment Variables: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`.
4. Nach dem Deploy die Vercel-Adresse in Supabase unter Site URL / Redirect URLs eintragen.

## 4. Übergabe an Kyri

1. Kyri legt eigene Konten an (Supabase, Vercel, GitHub) und lädt dich als Mitglied ein.
2. In **seinem** Supabase: `001_schema.sql`, `003_training.sql`, `004_counting.sql`, `005_planning.sql`, `006_client_actions.sql`, `007_programs.sql`, `008_storage.sql`, `009_session_days.sql`, `010_russian.sql`, `011_client_stats.sql` und `012_session_comments.sql` ausführen. Kein Seed. Stattdessen einmal:
   ```sql
   insert into trainers (slug, brand_name, owner_name, tagline, default_lang)
   values ('kyri', 'Train with Kyri', 'Kyriakos Nicolaou', 'Train with purpose.', 'en');
   insert into trainer_members (trainer_id, email)
   select id, 'KYRIS-EMAIL' from trainers where slug = 'kyri';
   ```
3. Repo zu ihm übertragen (GitHub → Settings → Transfer) oder neues Repo, Vercel mit seinen Keys verbinden, Domain dran.
4. Kyri meldet sich an und trägt unter **Settings** IBAN, Revolut-Link und Pakete selbst ein.

Nichts ist fest im Code: Name, Logo, Bankdaten, Revolut-Link und Pakete stehen in der Datenbank.
Das Logo liegt unter `public/logo.png` (und die App-Icons daneben). Wenn du die Originaldatei hast, einfach ersetzen.

---

## Wie es funktioniert

- **Login:** E-Mail-Link oder 6-stelliger Code, kein Passwort. Zugang bekommt nur, wer als Trainer oder Klient eingetragen ist (Abgleich per E-Mail beim ersten Login).
- **Rechte:** Supabase Row Level Security. Ein Klient sieht nur seine eigenen Termine, sein Paket und seine Zahlungen.
- **Einheiten:** Erledigt, nicht erschienen und kurzfristig abgesagt zählen automatisch gegen das Paket. Rechtzeitig abgesagt zählt nicht. Auf der Startseite: ✓ = erledigt, ✗ fragt nach, was passiert ist.
- **Zahlungen:**
  - Klient tippt „Ich habe bezahlt“ → erscheint bei Kyri unter *Zahlungen → Zu bestätigen*.
  - Bestätigen schiebt den Klienten in den nächsten Zeitraum (monatlich: Fälligkeit +1 Monat; Paket: neues Paket, Rest wird mitgenommen).
  - Bar / direkt erhalten: *Zahlung eintragen*.
- **Gym / Online:** pro Termin wählbar, bei Online mit Video-Link. Klienten haben eine Standardform (Gym, Online, Gym + Online).
- **Serientermine:** „Wöchentlich wiederholen“ beim neuen Termin, z. B. Mo + Do für 8 Wochen.
- **Programme (wie Kyris Notizen):** pro Klient ein Programm mit Tagen (Day 1, Day 2 …), Supersätzen und Finisher. Tage wiederholen sich. „Aus Notizen einfügen“ liest den Text aus der Notizen-App inkl. kg-Verlauf („30kg-35kg -40kg“, „/110“ = Ziel). „Tag bearbeiten“ ist ein Textfeld im selben Format. „Für anderen Kunden kopieren“. Kunden sehen Programme nie.
- **Look (v3):** Orange als Akzent, Schriftzug TRAINWITHKYRI, kräftige Schmalschrift (Fira Sans Extra Condensed, kann Griechisch + Russisch). Kunden-App mit Leiste unten (Start · Termine · Zahlungen · Profil), Startseite mit Woche, „Training heute“ (online), nächstem Termin, Kacheln und Fortschritt (Einheiten im Monat, Paket, Anwesenheit).
- **Programmtag im Kalender:** Kyri weist jeden Tag selbst einem Termin zu, im Termin („Programmtag“) oder im Programm („Einem Termin zuweisen“). Der Tag hängt am Termin: Termin verschieben = Tag wandert mit. Steht im Kalender und auf der Übersicht, beim Eintragen ist er vorausgewählt. Online-Kunden bekommen den Tag ihres heutigen Termins, sonst den nächsten in der Reihe.
- **kg-Verlauf:** Unter jeder Übung „60 · 70 · 80 · 90“. Wächst mit jedem Log (Kyri im Gym oder der Kunde online).
- **Eintragen im Gym:** ✓ auf der Übersicht (oder Name antippen) öffnet das Log: Tag wählen (nächster in der Reihenfolge ist vorausgewählt), nur geänderte kg eintragen, leer = wie letztes Mal. Der Haken bleibt manuell.
- **Video direkt in der Übung (v3.2):** In der Online-Einheit steht das Video oben in der Übung, mit Vorschaubild und Play-Knopf; es läuft in der App (YouTube im Datenschutz-Modus oder eigenes Video). Braucht echte Video-Links (youtube.com/watch?v=… oder youtu.be/…), keine Suchlinks.
- **Hinweis + Video pro Übung:** einmal gespeichert, in allen Programmen genutzt. YouTube-Link oder eigenes Video (Supabase Storage, `008_storage.sql`).
- **Online-Kunden:** sehen vorher nur, was sie brauchen (Geräte, Dauer, Kyris Hinweis). „Einheit starten“ zeigt eine Übung nach der anderen, kg/Wdh. pro Satz, Pausen- und Intervall-Timer, Wasserzeichen mit Name. Am Ende Notiz → „An Kyri senden“ → erscheint in der Übersicht und im kg-Verlauf.
- **Kommentar pro Übung + Stoppuhr (v3.1):** In der Online-Einheit läuft oben die Gesamtzeit mit; bei jeder Übung kann der Kunde einen Kommentar schreiben. Kyri sieht beides auf der Übersicht und im Profil, mit „geplant ~X Min.“ daneben (orange, wenn mehr als 25 % daneben).
- **Gym-Kunden** sehen nichts zum Training (auch technisch gesperrt).
- **PAR-Q + Regeln:** beim ersten Login Gesundheitsfragen, danach Kyris Regeln (einmal akzeptieren, Datum gespeichert, jederzeit unter „Meine Regeln“). Fragen und Regeln stehen in den Einstellungen; „Ja“-Antworten erscheinen rot bei Kyri.
- **Paket-Erinnerung:** Die App rechnet aus restlichen Einheiten + gebuchten Terminen aus, welcher Termin der letzte des Pakets ist, und zeigt dem Kunden X Tage vorher (Einstellungen, Standard 2) einen Hinweis mit „Neues Paket buchen“. Bei Kyri: „Paket endet bald“. Demo: nur in der App. Echte Version: zusätzlich per E-Mail.
- **Aktiv / Archiviert:** archivieren statt löschen, alle Daten bleiben. Archivierte Kunden können sich nicht anmelden.
- **Fortschritt:** im Kundenprofil (nur für Kyri): Einheiten, Anwesenheit, Rekord, Steigerung pro Übung.
- **Client-App:** Termin absagen (bis X Stunden vorher kostenlos, danach zählt es), WhatsApp-Button zu Kyri, neues Paket anfragen (Kyri nimmt an, Zahlung wird fällig), Termin in Apple-/Google-Kalender. WhatsApp-Nummer und Absagefrist stehen in den Einstellungen.
- **Handy:** Trainer-Bereich mit App-Leiste unten (Übersicht, Kalender, Klienten, Zahlungen, Mehr → Programme, Einstellungen), Kalender als Tagesansicht, Fenster als Blatt von unten. Sprache unter „Mehr“.
- **Sprachen:** Umschalter EN / ΕΛ / DE / RU. Klienten starten in der Sprache, die Kyri beim Klienten eingestellt hat. Texte liegen in `src/locales/`.
- **Mehrere Trainer:** Die Datenbank ist dafür schon ausgelegt (jede Zeile gehört zu einem Trainer). Für weitere Trainer braucht es später nur ein eigenes Projekt bzw. eine Trainer-Auswahl.

## Ordner

```
sql/001_schema.sql      Tabellen, Rechte, Funktionen
sql/002_seed_demo.sql   Fake-Daten zum Bauen und Zeigen
sql/003_training.sql    v1.1.0: Gym/Online, Serien, Trainingslog, Pläne
sql/004_counting.sql    v1.1.2: kurzfristige Absage, Zählregeln
sql/005_planning.sql    v1.3.0: Vorlagen, Pläne privat bis erledigt
sql/006_client_actions.sql v1.4.0: Absagen, Telefon, Paket-Anfragen
sql/007_programs.sql    v2.0.0: Programme, kg-Verlauf, Online-Einheiten, PAR-Q, Regeln, Archiv
sql/008_storage.sql     v2.0.0: Speicher für eigene Übungsvideos
sql/009_session_days.sql v2.1.0: Programmtage an Terminen
sql/010_russian.sql     v2.2.0: Russisch als 4. Sprache
sql/011_client_stats.sql v3.0.0: Zahlen für die Kunden-Startseite (Woche, Monat, Anwesenheit)
sql/012_session_comments.sql v3.1.0: Kommentar pro Übung, echte vs. geplante Dauer
sql/013_privacy.sql     v4.0.0: Datenschutz, Einwilligung beim PAR-Q, Kontakt-E-Mail
sql/014_translations.sql v4.1.0: automatische Übersetzung (Cache + Schalter)
supabase/functions/translate/index.ts  v4.1.0: Server-Funktion für DeepL
sql/LIVE_SETUP.sql      Kyris echtes System anlegen (statt Seed)
supabase/email-magic-link.html  Login-Mail im Kyri-Look
.github/workflows/backup.yml    wöchentliche verschlüsselte Sicherung
src/locales/            en.js, el.js, de.js, ru.js (+ v2/ für die neuen Texte)
src/pages/admin/        Übersicht, Kalender, Klienten, Zahlungen, Einstellungen
src/pages/client/       Client-App
```

## Für die echte Version (bei Kyri) notiert

- **Automatische Nachrichten:** E-Mail (z. B. Resend mit Kyris eigener Domain) zusätzlich zum Hinweis in der App, z. B. Paket-Erinnerung.
- **Automatische Übersetzung:** Was Kyri schreibt (Regeln, PAR-Q-Fragen, Übungshinweise, Notizen vor dem Training, Paketnamen), wird beim Speichern einmal per DeepL in die Kundensprache übersetzt und in der Datenbank gespeichert. Notizen und PAR-Q-Erklärungen der Kunden sieht Kyri in seiner Sprache. Jeweils „Original anzeigen“; bei PAR-Q und Regeln Hinweis „automatisch übersetzt“. Übungsnamen bleiben unübersetzt. Braucht: DeepL-API-Schlüssel + Supabase Edge Function.


## Livegang: Kyris echtes System (Demo bleibt bestehen)

1. **Supabase:** neues Projekt `kyri-live`, Region **Frankfurt (eu-central-1)**. SQL Editor: `001`, dann `003` bis `013` der Reihe nach, dann `LIVE_SETUP.sql`. **Kein** `002_seed_demo.sql`.
2. **Mail-Versand (Resend):** Konto anlegen → Domains → Kyris Domain hinzufügen → die angezeigten DNS-Einträge beim Domain-Anbieter eintragen → „Verify“. API Keys → neuen Schlüssel kopieren.
3. **Supabase → Authentication → Emails → SMTP Settings:** Enable custom SMTP · Host `smtp.resend.com` · Port `465` · User `resend` · Password = Resend-Schlüssel · Absender `login@seinedomain.com`, Name `Train with Kyri`. Danach unter „Templates“ bei **Magic Link** und **Confirm signup** den Inhalt von `supabase/email-magic-link.html` einfügen. Unter Authentication → Rate Limits die E-Mail-Grenze z. B. auf 30/Stunde setzen.
4. **Vercel:** Add New → Project → dasselbe GitHub-Repo erneut importieren, Name `kyri-live`. Environment Variables: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` vom **neuen** Projekt; `VITE_PASSWORD_LOGIN` **weglassen**. Deploy. Settings → Domains → `app.seinedomain.com` hinzufügen und den angezeigten CNAME beim Domain-Anbieter eintragen.
5. **Supabase → Authentication → URL Configuration:** Site URL `https://app.seinedomain.com`, Redirect URLs `https://app.seinedomain.com/**`.
6. **Sicherung:** GitHub → Repo → Settings → Secrets and variables → Actions: `SUPABASE_DB_URL` (Supabase → Connect → Session pooler, mit DB-Passwort) und `BACKUP_PASSPHRASE` (langes Passwort, gut aufheben). Actions → Backup → „Run workflow“ einmal testen.
7. **Kyri:** meldet sich mit `trainwithkyri1@outlook.com` an (Link per Mail) → Einstellungen: Bankdaten, Revolut, WhatsApp, Pakete, Regeln, Datenschutz-E-Mail → Klienten anlegen → „Einladung kopieren“ per WhatsApp an die Kunden → Programme aus den Notizen einfügen.

Beide Systeme laufen aus demselben Code: Jeder `git push` aktualisiert Demo und Live gleichzeitig. Die Daten sind komplett getrennt.

## Automatische Übersetzung (v4.1.0)

Kyris Texte (Regeln, PAR-Q-Fragen, Datenschutztext, Übungshinweise, Paketnamen, Tagestitel/-hinweise) erscheinen für jeden Kunden in seiner Sprache.
Optional (Einstellungen → Übersetzung): Kundenkommentare und PAR-Q-Erklärungen für Kyri übersetzen – nur mit bezahltem DeepL-Tarif einschalten.
Jeder Text wird pro Sprache nur einmal bei DeepL übersetzt und in `tr_cache` gespeichert (nur ein Fingerabdruck des Originals, nicht das Original).
Ohne DeepL-Schlüssel zeigt die App einfach die Originaltexte.

Einrichtung:
1. DeepL-API-Konto anlegen (deepl.com/pro-api, „DeepL API Free“) und den Authentifizierungsschlüssel kopieren.
2. Supabase → SQL Editor: `sql/014_translations.sql` ausführen.
3. Supabase → Edge Functions → Secrets: `DEEPL_API_KEY` = Schlüssel.
4. Supabase → Edge Functions → Deploy a new function → Via Editor, Name `translate`, Inhalt von `supabase/functions/translate/index.ts` einfügen, Deploy.
   In den Einstellungen der Funktion „Verify JWT with legacy secret“ ausschalten (die Funktion prüft den Login selbst).

## Login mit Passwort (v4.2.0)

- Anmeldeseite: E-Mail + Passwort.
- „Zum ersten Mal hier?“ → Link/Code per E-Mail → danach legt man einmal ein Passwort fest (mind. 8 Zeichen, „Später“ möglich).
- „Passwort vergessen?“ → Link per E-Mail → danach neues Passwort festlegen.
- Passwort ändern: Kunden unter Profil, Kyri unter Einstellungen → Anmeldung.
- Supabase: Authentication → Sign In / Providers → Email muss aktiv sein (Standard). „Secure password change“ ausgeschaltet lassen, sonst klappt „Passwort ändern“ nur direkt nach einer Anmeldung.
- Keine SQL-Änderung nötig.

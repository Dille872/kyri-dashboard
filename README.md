# Train with Kyri – Coach Dashboard (v3.0.1)

Web-App für Trainer und Klienten: Kalender, Klienten mit Paketen, Zahlungen (Revolut, Überweisung, Bar) und eine Client-App für das Handy. Sprachen: Englisch, Griechisch, Deutsch.

Stack wie beim Agentur-Dashboard: Vite + React + Supabase, Hosting auf Vercel.

---

## 1. Supabase-Projekt anlegen (einmalig, ~10 Min.)

1. Auf supabase.com ein **neues Projekt** anlegen, z. B. `kyri-dashboard` (getrennt vom Agentur-Dashboard). Region: Frankfurt.
2. **SQL Editor** → Inhalt von `sql/001_schema.sql` einfügen → Run.
3. **SQL Editor** → Inhalt von `sql/003_training.sql` einfügen → Run, danach `sql/004_counting.sql` → Run, danach `sql/005_planning.sql` → Run, danach `sql/006_client_actions.sql` → Run, danach `sql/007_programs.sql` → Run, danach `sql/008_storage.sql` → Run (für eigene Videos), danach `sql/009_session_days.sql` → Run, danach `sql/010_russian.sql` → Run, danach `sql/011_client_stats.sql` → Run.
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
In `.env.local` steht `VITE_PASSWORD_LOGIN=true`, dann gibt es auf der Login-Seite „Test-Login mit Passwort“.
In einem privaten Fenster damit anmelden → Client-Ansicht. Für die Live-Version diese Zeile weglassen.

## 3. Online stellen (Vercel)

1. Neues **privates GitHub-Repo** `kyri-dashboard`, Ordner pushen.
2. Auf vercel.com: Add New → Project → Repo wählen. Framework: Vite (erkennt es selbst).
3. Environment Variables: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`.
4. Nach dem Deploy die Vercel-Adresse in Supabase unter Site URL / Redirect URLs eintragen.

## 4. Übergabe an Kyri

1. Kyri legt eigene Konten an (Supabase, Vercel, GitHub) und lädt dich als Mitglied ein.
2. In **seinem** Supabase: `001_schema.sql`, `003_training.sql`, `004_counting.sql`, `005_planning.sql`, `006_client_actions.sql`, `007_programs.sql`, `008_storage.sql`, `009_session_days.sql`, `010_russian.sql` und `011_client_stats.sql` ausführen. Kein Seed. Stattdessen einmal:
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
- **Hinweis + Video pro Übung:** einmal gespeichert, in allen Programmen genutzt. YouTube-Link oder eigenes Video (Supabase Storage, `008_storage.sql`).
- **Online-Kunden:** sehen vorher nur, was sie brauchen (Geräte, Dauer, Kyris Hinweis). „Einheit starten“ zeigt eine Übung nach der anderen, kg/Wdh. pro Satz, Pausen- und Intervall-Timer, Wasserzeichen mit Name. Am Ende Notiz → „An Kyri senden“ → erscheint in der Übersicht und im kg-Verlauf.
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
src/locales/            en.js, el.js, de.js, ru.js (+ v2/ für die neuen Texte)
src/pages/admin/        Übersicht, Kalender, Klienten, Zahlungen, Einstellungen
src/pages/client/       Client-App
```

## Für die echte Version (bei Kyri) notiert

- **Automatische Nachrichten:** E-Mail (z. B. Resend mit Kyris eigener Domain) zusätzlich zum Hinweis in der App, z. B. Paket-Erinnerung.
- **Automatische Übersetzung:** Was Kyri schreibt (Regeln, PAR-Q-Fragen, Übungshinweise, Notizen vor dem Training, Paketnamen), wird beim Speichern einmal per DeepL in die Kundensprache übersetzt und in der Datenbank gespeichert. Notizen und PAR-Q-Erklärungen der Kunden sieht Kyri in seiner Sprache. Jeweils „Original anzeigen“; bei PAR-Q und Regeln Hinweis „automatisch übersetzt“. Übungsnamen bleiben unübersetzt. Braucht: DeepL-API-Schlüssel + Supabase Edge Function.

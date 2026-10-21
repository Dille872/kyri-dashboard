# Train with Kyri – Coach Dashboard (v1.2.1)

Web-App für Trainer und Klienten: Kalender, Klienten mit Paketen, Zahlungen (Revolut, Überweisung, Bar) und eine Client-App für das Handy. Sprachen: Englisch, Griechisch, Deutsch.

Stack wie beim Agentur-Dashboard: Vite + React + Supabase, Hosting auf Vercel.

---

## 1. Supabase-Projekt anlegen (einmalig, ~10 Min.)

1. Auf supabase.com ein **neues Projekt** anlegen, z. B. `kyri-dashboard` (getrennt vom Agentur-Dashboard). Region: Frankfurt.
2. **SQL Editor** → Inhalt von `sql/001_schema.sql` einfügen → Run.
3. **SQL Editor** → Inhalt von `sql/003_training.sql` einfügen → Run, danach `sql/004_counting.sql` → Run.
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
2. In **seinem** Supabase: `001_schema.sql`, `003_training.sql` und `004_counting.sql` ausführen. Kein Seed. Stattdessen einmal:
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
- **Trainingslog:** ✓ auf der Übersicht oder Name antippen öffnet das Log, vorausgefüllt mit dem letzten Mal. Auch im Termin: Übungen mit Sätzen × Wdh. @ kg, „Letztes Mal“ als Vorlage, private Notiz nur für Kyri.
- **Trainingspläne (Online):** Wochenplan pro Klient. Klient hakt ab und trägt seine Kilos ein. „In nächste Woche kopieren“ übernimmt die tatsächlichen Kilos. Check-in-Tag pro Klient erscheint in der Übersicht.
- **Sichtbarkeit:** pro Klient abschaltbar; in den Einstellungen optional Sperre bei Überfälligkeit und Zeitfenster für die Historie.
- **Handy:** Trainer-Bereich mit App-Leiste unten (Übersicht, Kalender, Klienten, Zahlungen, Mehr), Kalender als Tagesansicht, Fenster als Blatt von unten. Sprache unter „Mehr“.
- **Sprachen:** Umschalter EN / ΕΛ / DE. Klienten starten in der Sprache, die Kyri beim Klienten eingestellt hat. Texte liegen in `src/locales/`.
- **Mehrere Trainer:** Die Datenbank ist dafür schon ausgelegt (jede Zeile gehört zu einem Trainer). Für weitere Trainer braucht es später nur ein eigenes Projekt bzw. eine Trainer-Auswahl.

## Ordner

```
sql/001_schema.sql      Tabellen, Rechte, Funktionen
sql/002_seed_demo.sql   Fake-Daten zum Bauen und Zeigen
sql/003_training.sql    v1.1.0: Gym/Online, Serien, Trainingslog, Pläne
sql/004_counting.sql    v1.1.2: kurzfristige Absage, Zählregeln
src/locales/            en.js, el.js, de.js
src/pages/admin/        Übersicht, Kalender, Klienten, Zahlungen, Einstellungen
src/pages/client/       Client-App
```

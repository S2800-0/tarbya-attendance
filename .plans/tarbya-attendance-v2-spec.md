# Tarbya Attendance v2: Spec

QR attendance for كلية التربية – جامعة المنوفية.
Repo: `S2800-0/tarbya-attendance`. v1 is one `index.html` (vanilla JS), with a manifest and service
worker, hosted on GitHub Pages. Everything runs on the device; there is no server.

## Goals

1. Students can identify with **الرقم القومي** (national ID) or **الرقم الأكاديمي** (academic number).
2. Protect national IDs: masked on screen, never sent to any server.
3. Honest hardening against the most common cheat: a student showing an absent friend's card.
4. Staff keep past sessions, can import class lists, and export present and absent students.
5. Better "real app" experience on phones (install, updates, sound).
6. Deploy on **Vercel**; turn off GitHub Pages.

## Non-goals

- No backend, accounts or cloud database. It stays **offline-first**: it works in lecture halls with
  weak signal, costs nothing, and no national IDs are stored on a server (this avoids obligations
  under Egypt's Personal Data Protection Law 151/2020).
- No build step or framework. Keep plain HTML/CSS/JS with vendored libraries so Vercel serves static
  files and the offline cache stays simple. Splitting `index.html` into a few files (`app.js`,
  `styles.css`, `nid.js`) is fine.

## 1. ID type and national ID

### Student form
- New segmented control above the ID field: **الرقم القومي** (default for new cards) | **الرقم الأكاديمي**.
- National ID input: `inputmode="numeric"`, 14 digits, accepts Arabic-Indic digits (converted with the
  existing `toLatinDigits`), and ignores spaces and dashes.
- Academic number: same rules as v1 (`^\d{2,20}$`).

### National ID validation (structure check)
Reject with a specific Arabic message when:
- the length is not 14 digits → "الرقم القومي ١٤ رقمًا"
- the first digit (century) is not `2` (1900s) or `3` (2000s)
- digits 2–7 (`YYMMDD`) are not a real date, or the date is in the future, or the age is under 14
  or over 80 (a sanity range for university students)
- digits 8–9 (governorate code) are not in this list: 01–04, 11–19, 21–29, 31–35, 88.
  Check the list once against an official source before release.

Don't check digit 14 (check digit). The algorithm isn't officially published, so a wrong check
would reject real IDs.

Put the logic in its own small module `nid.js` (`parseNationalId(str) → {ok, error, birthDate, governorate}`)
with a set of test IDs (valid and invalid) in a comment or `nid.test.html`.

### Masking
- The card shows a masked ID: `•••••••••• 1234` (last 4 digits). A small "إظهار" button shows the full
  ID for 5 seconds.
- The staff roster also shows masked national IDs. The full ID appears only in the record edit dialog
  and the Excel export.
- Academic numbers are not masked.

### QR payload v2
```json
{"v":2,"t":"tarbya-att","n":"name","k":"n|a","i":"id","y":"year","d":"deviceId","ts":1234567890,"c":1234567890}
```
- `k`: ID type (`n` national, `a` academic).
- `c`: when the ID number was last changed (optional). See section 2.
- The scanner still accepts **v1** payloads as `k:"a"`, so old cards keep working.
- The QR still carries the full ID. Masking protects the screen; the QR is accepted as readable by
  any QR app (an accepted tradeoff; encryption was not chosen).

### Existing cards
Saved v1 profiles keep working as academic-number cards. Nothing is cleared. Students can switch
to a national ID from "تعديل البيانات".

### Duplicates
A duplicate is the same `k + i` within a session. Also warn (without blocking) when the same
**normalized name** appears with a different ID: "اسم مطابق لطالب مسجّل برقم مختلف".

## 2. Anti-cheat: lock the ID to the phone

Problem: a student types a friend's name and ID into their own phone.

- The **first** switch from academic → national ID is free and immediate.
- Any later change to the ID number (or its type) is **pending for 24 hours**. During that time the
  card keeps showing the old ID, with a note: "سيتم تفعيل الرقم الجديد بعد ٢٤ ساعة".
- After the change applies, the QR carries `c` (change time). For 7 days the scanner shows the chip
  **"تغيّر الرقم مؤخرًا"** on that record, and the chip appears in the Excel notes column.
- Name typo fixes are free and don't trigger the lock.
- **Known limitation (write it in the README):** clearing the browser data creates a new device ID
  and resets the lock. This deters the casual cheat; it doesn't stop a determined one. Staff
  watching the room is still the real control.

## 3. Staff: history, class lists, export

### Past sessions
- "إنهاء الجلسة" no longer deletes. The session moves to **الجلسات السابقة** (a list on the staff tab,
  newest first): name, date, count present / count on list.
- Each past session can be re-exported (download / share) or deleted, with confirmation.
- **Settings → "حذف كل البيانات"**: deletes all past sessions and class lists at once (double
  confirmation that names what will be deleted, for example at the end of term).
- Storage: move sessions and class lists to **IndexedDB** (localStorage is limited to about 5 MB and
  blocks the page). Keep small settings in localStorage. Migrate any open v1 session on first run.

### Class lists (قوائم الطلاب)
- Import `.xlsx` or `.csv`. Parse `.xlsx` with the vendored **fflate** (unzip) + `DOMParser`
  (shared strings + first sheet). No new library.
- Detect columns from header text (`الاسم`, `اسم الطالب`, `الرقم القومي`, `قومي`, `الرقم الأكاديمي`,
  `الرقم الجامعي`, `كود`, `الفرقة`). A preview step shows the first 5 rows, with dropdowns to fix each
  column's meaning.
- Rows with an invalid national ID are kept but marked, and the import summary shows the count.
- Lists are **saved** with a name (for example "علم النفس التربوي – الفرقة الثانية") and chosen from a
  dropdown when starting a session (optional). Lists can be renamed, re-imported, and deleted.

### Matching scans to a list
- A scan matches a list row by national ID or academic number, depending on which the list has
  (it may have one or both).
- No match → the record gets the chip **"غير موجود في القائمة"**. It is still recorded.
- No name matching (not chosen), to avoid false matches.
- Live counters gain **غائب** (list size − matched) when a list is attached.

### Excel export
- **Sheet 1 – الحضور**: م · الاسم · رقم الهوية · النوع (قومي/أكاديمي) · الفرقة · وقت التسجيل · ملاحظات
- **Sheet 2 – الغياب** (only when a list is attached): the list's columns for unmatched rows.
- **Sheet 3 – غير مدرج** (only if there are any): scanned students who aren't on the list.
- IDs are stored as **text** cells (the existing `numFmt "@"` style) so Excel doesn't turn 14-digit
  numbers into `2.98E+13`. Excel keeps Latin digits, so sorting and lookups work.
- Notes include flags: نفس الهاتف · تغيّر الرقم مؤخرًا · يدوي.

## 4. App experience

- **Install button**: catch `beforeinstallprompt` (Android/Chrome) to show "تثبيت التطبيق". On iOS
  Safari, show a one-time hint: "اضغط مشاركة ← إضافة إلى الشاشة الرئيسية".
- **Update prompt**: when a new service worker is waiting, show a toast "يتوفر تحديث" with an
  "تحديث" button (`skipWaiting` + reload). Bump the cache version on every release.
- **Sound on scan**: a short beep for success; a lower double tone for warnings (Web Audio, no
  files). Toggle in staff settings, on by default. Vibration stays.
- **Arabic-Indic digits across the UI**: counters, times, dates, list numbers, masked IDs and the
  card ID all display as ٠–٩ through one `ar(n)` helper. Inputs accept both digit systems. Excel and
  QR payloads keep Latin digits.
- **Fresh "modern & bright" look** (replaces the v1 green/lime): soft off-white background, vivid indigo
  primary, large rounded cards (20–28px), soft shadows, bold tabular numbers. Keep IBM Plex Sans Arabic
  (already bundled, works offline). Light and dark tokens are designed together.
- **Scan result = big flash over the camera** for about 1.2 s: green ✓ + name (success); amber ! + reason
  (warning or rejected). It is readable at arm's length, and the banner below keeps the last result.
- **Staff navigation**: sub-tabs under "تسجيل الحضور": **جلسة | السجل | القوائم**, with settings (sound,
  note prompt, delete all) behind a gear icon. The staff tab stays visible to everyone (harmless on a
  student phone, since data is per device).
- **Accessibility fixes from the UI audit**: all tap targets at least 44px; secondary text contrast at least
  4.5:1; no text under 12px; form errors announced (`role="alert"`) with focus on the first invalid
  field; tabs linked to their panels (`aria-controls`); no `transition: all`.

## 5. Deploy

- Vercel project connected to `S2800-0/tarbya-attendance` (the user already has an account). Framework:
  "Other", no build command, output directory = repo root. Every push to `main` deploys.
- Add `vercel.json` with:
  - `Cache-Control: no-cache` for `index.html`, `sw.js`, `manifest.webmanifest` (so updates arrive)
  - long cache for `fonts/*` and `vendor/*`
  - `Permissions-Policy: camera=(self)` and basic security headers (`X-Content-Type-Options`,
    `Referrer-Policy: no-referrer`)
- Update `manifest.webmanifest` `start_url`/`scope` to `/` for the root path.
- **Turn off GitHub Pages** after Vercel is live (nobody uses the old link yet). Update the README
  with the new link.

## 6. Testing checklist

- National ID validator: valid IDs from both centuries; wrong length; bad month/day; Feb 29 in a
  non-leap year; unknown governorate; Arabic-Indic input.
- A v1 card (academic) scans successfully on v2.
- Academic → national switch is immediate; a second change is pending 24h; the chip shows for 7 days.
- Class list import: Arabic headers, English headers, CSV in UTF-8 with BOM, a sheet with an empty
  first row, 500+ rows.
- Export opens correctly in Excel and Google Sheets: right-to-left, IDs not in scientific notation,
  all 3 sheets present.
- Offline: install, go into airplane mode, run a full session, and export.
- iOS Safari + Android Chrome: camera on the Vercel HTTPS link, install flow, update toast.

## Suggested work split

1. `nid.js` validator + student form + card masking + QR v2 + ID lock (student side).
2. Scanner changes: v1/v2 parsing, flags, duplicates, sound, Arabic digits (staff live view).
3. IndexedDB storage, past sessions, delete-all, class list import + matching.
4. Excel export with 3 sheets, plus the install/update experience, `vercel.json`, deploy, README.

Shared contract to agree first: the QR v2 payload and the record shape
`{key, name, idType, id, year, device, at, note, manual, flags[], rosterRowId?}`.

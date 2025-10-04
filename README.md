# דשבורד צוות בדיקות — סקירה מלאה ומדריך למפתחים

מסך דשבורד סטטי (RTL, ממשק בעברית) לניהול ותצוגת סטטוס של פרויקטים, כולל ניטור סינתטי גמיש ל־API: התחברות (אופציונלי), הרצת בדיקות HTTP סדרתיות, תזמון (אופציונלי), וחיווי תוצאות על הכרטיסים. הנתונים נטענים מהקובץ `projects.json` בטעינה הראשונה ונשמרים לאחר מכן אל `localStorage`.

- ללא תלות חיצונית: HTML/CSS/JavaScript בלבד
- מותאם RTL, נגישות מקלדת בסיסית, מצב כהה/בהיר

---

## מטרה

- לתת לצוות QA/בדיקות תמונה מרוכזת של פרויקטים, קישורים ומצבם.
- להוסיף שכבת ניטור סינתטי: תסריטי API פשוטים לכל פרויקט (התחברות + בדיקות), הרצה ידנית, ותיעוד התוצאות.
- להוות בסיס קליל שניתן להרחבה, שמשרת גם תפעול וגם המשך פיתוח.

---

## טכנולוגיות וארכיטקטורה

- צד לקוח בלבד (Static SPA): `index.html`, `styles.css`, `script.js`.
- אין Build/תלויות. ניתן לשרת מכל שרת סטטי.
- מקור נתונים: `projects.json` (טעינה ראשונה), לאחר מכן `localStorage` (`projectsData`, `projectHistory`, `darkMode`).
- ישויות ליבה:
  - Project: שם, URL (אופציונלי), 4 שדות חופשיים (תווית+ערך), `monitor` (אובייקט ניטור).
  - Monitor: `baseUrl`, הגדרות כניסה (`login`), מערך בדיקות (`tests`), תזמון (`schedule`), ומצב אחרון (`state`).

---

## מבנה הפרויקט

```
.
├─ index.html     # שלד ה־UI: כותרת, טיקר, מודלים (הוספה/עריכה/היסטוריה), גריד כרטיסים, פוטר
├─ script.js      # לוגיקה: טעינה/שמירה/רינדור, מודלים, היסטוריה, בדיקות קישוריות, ניטור סינתטי
├─ styles.css     # עיצוב, מצב כהה, גריד רספונסיבי, RTL, טוסטרים, טאבים ו־Run Now
├─ projects.json  # דוגמת נתונים לטעינה ראשונית
├─ SECURITY.md    # עקרונות הקשחה ומגבלות ידועות
└─ CHANGES.md     # יומן שינויים (מומלץ להתייחס לקוד כמקור אמת)
```

---

## הפעלה מקומית

מומלץ להריץ את התיקייה תחת שרת סטטי (כדי לאפשר `fetch` ל־`projects.json`). לדוגמה:

- Python: `python -m http.server 5500` ואז לפתוח `http://localhost:5500/`

פתיחה ישירה כ־`file://` עלולה לחסום את הקריאה הראשונה ל־JSON.

---

## UX/UI — מבט מהיר

- כותרת עליונה + טיקר: מציג שמות פרויקטים בגלילה רציפה.
- פס אזהרת קישוריות: אם אין תגובה ל־DNS ציבוריים, מופיע באנר ו־`connection-lost` על `<body>`.
- גריד כרטיסים: כל כרטיס מציג שם ו־4 שדות (תווית+ערך), וחיווי סטטוס (URL + ניטור Tests).
- מקלדת: כרטיסים ניתנים לפתיחה גם עם Enter/Space; טאבים במודל תומכים ARIA (Tablist/Tab/Tabpanel).
- פוטר: כפתורי העלאה, שמירה ל־JSON, שינוי עיצוב, הוספת פרויקט, היסטוריה.
- מצב כהה: שמירה ב־`localStorage`.

---

## פעולות עיקריות

- העלאת JSON: `Upload` → בחירת קובץ `projects.json`, החלפת כל הנתונים ושמירה ב־`localStorage`.
- הוספת פרויקט: `Add Project` → שם (חובה), URL (אופציונלי), עד 4 שדות מותאמים.
- עריכה/מחיקה: פתיחת כרטיס → מודל עריכה; מחיקה עם אישור. כל שינוי נרשם ב־History.
- הורדת JSON: `Save קובץ` → יצוא `projectsData` בפורמט יפה (indent 4).
- מצב כהה: `שנה עיצוב`.
- היסטוריה: `היסטוריה` → רשימת פעולות עם תאריך/שעה.

מגבלות קלט לשמירת פריסה: שם עד 20 תווים; תווית שדה עד 15; ערך עד 20.

---

## חיווי סטטוס בכרטיסים

- עיגול שמאלי: סטטוס URL (Best‑effort) באמצעות `fetch(..., { method: 'HEAD', mode: 'no-cors' })`.
  - לבן — לא הוגדר URL/לא נבדק
  - ירוק — ניתן להשיג (רק אינדיקציה; תגובת no‑cors אטומה)
  - אדום — שגיאת רשת/חסימת CORS
- עיגול שני: סטטוס בדיקות (Monitor): Pass/Partial/Fail/Unknown לפי הרצה אחרונה.
- "Last check": חותמת זמן ממוינת (מ־`monitor.state.lastRunAt`).

הערה: לקבלת תוצאה אמינה לפרודקשן, יש לשקול פרוקסי בצד שרת (ראו "מגבלות קישוריות").

---

## פורמט נתונים (projects.json)

דוגמה מינימלית לפרויקט:

```json
[
  {
    "name": "שם הפרויקט",
    "url": "https://example.com",
    "fieldNames": { "1": "בעלים", "2": "סטטוס", "3": "תאריך", "4": "טלפון" },
    "fields": { "1": "דוגמה", "2": "בתהליך", "3": "2025-05-23", "4": "050-1234567" }
  }
]
```

מפתחות `fieldNames`/`fields` הם המחרוזות "1"–"4". `url` אופציונלי.

בעת טעינה ראשונה, מתווסף אוטומטית לכל פרויקט אובייקט `monitor` עם ערכי ברירת מחדל (מיגרציה).

---

## ניטור סינתטי (Monitor)

לכל פרויקט ניתן להגדיר:

- Base URL: כתובת הבסיס לכל הבדיקות.
- Login (אופציונלי):
  - Method/Path/Header/Body (תמיכה ב־template placeholders)
  - חילוץ Token מ־`json:path` או מ־`header:Authorization`
  - הזרקת הטוקן לבדיקות דרך Header שמוגדר ב־`tokenHeaderName`/`tokenPrefix`
- Tests: מערך בדיקות, כל בדיקה כוללת:
  - `name`, `required` (משפיע על פסק הדין Overall)
  - `requiresLogin` (ידרוש שההתחברות הצליחה)
  - `method` (GET/POST/PUT/PATCH/DELETE)
  - `path` (נבנה מול Base URL)
  - `expectedStatus` (מספר/CSV)
  - `bodyTemplate`, `headers` (טקסט Key:Value בשורות)
- Schedule: הרצה אוטומטית (`enabled`, `intervalSec` — 30–3600), ברירת מחדל כבוי.

תבניות (Placeholders) נתמכות בשדות `bodyTemplate`/`path`/`login.bodyTemplate`:
`${username}`, `${password}`, `${token}`, `${timestamp}`, `${random}`, `${lastCreatedId}`.

הרצה ידנית (`Run Now`) זמינה בכרטיס ובמודל. תוצאות נשמרות ב־`monitor.state`:
`overall`, `tests[id] = { status, lastCode, lastError }`, `failures[]`, `lastRunAt`, `tokenStoredAt`, `lastCreatedId`.

טוסטרים מעדכנים בפידבק (Pass/Partial/Fail/Unknown) עם סיכום בדיקות.

---

## זרימות מרכזיות "מאחורי הקלעים"

- אתחול (onload):
  - קריאה ל־`initializeMonitorUI()` → רישום מאזינים לכפתורי המודל.
  - ניסיון טעינה מ־`localStorage`; אם אין — טעינה מ־`projects.json` ושמירה.
  - `ensureMonitorDefaults()` → הוספת `monitor` ברירת מחדל לכל פרויקט חסר.
  - `renderProjects()` + `renderHotItems()` + התחלת מתזמן `startMonitorScheduler()`.
  - בדיקות עזר: `checkProjectStatuses()` (URL), `checkLocalConnectivity()` (DNS).
- עריכת פרויקט: `openEditModal(index)` → `setupMonitorTabs`/`populateMonitorTabs` →
  `enterMonitorEditMode` (CRUD טסטים, ולידציה, סטטוסי לשוניות) → `saveEdit()` מאסף ערכים דרך `collectMonitorFromForm()` וממזג ל־`project.monitor` 
  ושומר ל־`localStorage`.
- הרצת בדיקות: `runProjectChecks(index)` → `performLogin()` (אם דרוש) → לולאת `executeTest()` לפי סדר הבדיקות → `persistRunResult()`.
- רשת: `monitorFetch()` עם `AbortController`, ניהול timeouts, וניקיון מאזינים בביטול/סיום.

---

## נגישות ושמישות

- טאבים במודל מוגדרים עם Roles/ARIA תקינים; ניווט חצים + Enter/Space.
- כרטיסים אינטראקטיביים: `role="button"`, `tabIndex=0`, תמיכה ב־Enter/Space לפתיחה.
- צבעים/מצב כהה ניתנים להתאמה באמצעות CSS Custom Properties.

---

## אבטחה ומגבלות ידועות

- סינון קלט: `escapeHTML` לפני הזרקה ל־`innerHTML`/attribute; היסטוריה/כותרות מטופלות בבטחה.
- אין לשמור סודות אמתיים ב־`localStorage`.
- בדיקות URL/קישוריות מבוססות `no-cors` → תגובה אטומה. לפרודקשן: לשקול פרוקסי בצד שרת או סימון "Unknown".

ראו גם: `SECURITY.md`.

---

## מדריך למפתחים (קוד עיקרי)

- רינדור וכרטיסים: `renderProjects`, `decorateCardWithMonitorStatus`, `updateMonitorIndicator`.
- מודלים: `openEditModal`, `saveEdit`, `closeEditModal`, `openAddModal`, `saveNewProject`, `openHistoryModal`.
- נתונים: `handleFileUpload`, `downloadUpdatedJSON`, `addToHistory`.
- ניטור: `createDefaultMonitor`, `ensureMonitorDefaults`, Tabs (`setupMonitorTabs`/`resetMonitorTabs`),
  `populateMonitorTabs`, `enterMonitorEditMode`/`exitMonitorEditMode`, `collectMonitorFromForm`.
- ריצה: `runProjectChecks`, `performLogin`, `executeTest`, `monitorFetch`, `persistRunResult`.
- שיפור UX: טוסטרים (`showMonitorToast`), מתזמן (`startMonitorScheduler`/`stopMonitorScheduler`).

קישורי `localStorage`:
- `projectsData` — מערך הפרויקטים המלא (כולל `monitor`).
- `projectHistory` — היסטוריית פעולות.
- `darkMode` — העדפת תצוגה.

איפוס מהיר: מחיקת המפתחות לעיל מ־`localStorage` ורענון העמוד.

---

## בדיקות ידניות מומלצות

- טעינה ראשונית מ־`projects.json` ושמירה ל־`localStorage`.
- הוספה/עריכה/מחיקה → היסטוריה מתעדכנת, הכרטיסים מתרנדרים.
- XSS: הזנת `<script>`, `<img onerror=...>`, תווי `&<>"'` — מוצגים כטקסט.
- ניטור: הגדרת Base URL, בדיקת Login (חילוץ טוקן), בדיקות עם `expectedStatus` שונים.
- מצב כהה: נשמר לאחר רענון.

---

## כיווני הרחבה הבאים

- פרוקסי בדיקות שרתיות להחזרת קודי סטטוס אמיתיים (CORS/אימות).
- תמיכה בתגובות JSON מורכבות לבדיקות אימות תוכן (לא רק קוד סטטוס).
- לוג ריצות מפורט לכל בדיקה (זמן תגובה, כותרות).
- שיתוף תצורות Monitor בין פרויקטים/ייצוא חלקי.

---

© 2025 — דשבורד צוות בדיקות

## Manual Test Checklist

- Initial load: Cards load from `projects.json` and persist to `localStorage`
- XSS hardening: Add/Edit fields with `<script>…</script>`, `<img onerror=…>` and quotes — should render as plain text
- Edit/Save: Changes reflect on cards and in `localStorage`; history logs the action
- Delete: Removes the card and appends a history entry
- Download JSON: File contents match the current data
- Dark mode: Preference persists after reload

---

## Development Notes

- No external dependencies, just static files
- RTL and Hebrew UI text; CSS custom properties with a `.dark` theme override
- Keep DOM updates safe (prefer `textContent`/`setAttribute`, or escape before templating)

---

## Recent Progress

- Slice 3: introduced the monitor tabs skeleton (initially gated for testing) with ARIA-safe navigation.
- Slice 4: delivered read-only bindings for API/Auth, Tests, Schedule; responsive helpers and WeakMap-based tab management.
- Slice 5: wired the edit-mode toggle, validation, and tests CRUD; persist changes into each project's `monitor`.
- Slice 6: enabled manual Run Now execution, toast feedback, and removed the `enableMonitorUI` flag so the monitor is always on by default.

# יומן שינויים (CHANGES)
## 2025-10-01

### Slice 3 - Tabs skeleton
- ×‘×•×¦×¢ ×ž×™×ž×•×© ×œ×©×•×× ×™×•×ª API/Auth/Tests/Schedule ×‘×ž×•×“×œ ×”×¢×¨×™×›×” ×ž××—×•×¨×™ ×”×“×’×œ enableMonitorUI, ×›×•×œ×œ ×›×œ×œ ×‘×ø×™×¨×ª ×ž×—×“×œ, roles/ARIA ×å×ú×ž×™×ë×ª ×î×§×œ×“×ª.
- ×¢×“×›× ×œ×¡×’× ×•××•×ª ×”×œ×©×•×× ×™×•×ª ×•×ª×™××•× ×©×”×ž×—×¨××•×ª (.monitor-tab, .monitor-panel) ×œ×œ×©×ž×¨ ×”×•×¨××–×•×¨×™×§×” ×”×—×“×©× כר×’×¨×§×ª ××‘×¨×™×™ ×ž×ª× ×˜×ˆ×•×˜ ×•×¤×”×œ×ª ×�×�×™×¡×ª ×”×œ×™×©×˜×¢ ×“×•×—×” ×’×�×‘ ×œ××¤×˜×¨.

### Slice 4 - Read-only binding
- Added read-only monitor tab content behind the `enableMonitorUI` flag, including token/login helpers and schedule fields populated from `project.monitor`.
- Rendered monitor tests as safe DOM cards with headers/body/status metadata only when data exists, while keeping the empty state message when the array is missing.
- Styled helpers, read-only controls, and responsive grid updates for dark mode/RTL without enabling any save or external network side effects.

## 2025-09-30

### עדכון מודל נתונים
- נוספה מיגרציה אוטומטית שמוסיפה לכל פרויקט אובייקט `monitor` עם ערכי ברירת מחדל.
- הנתונים נשמרים בחזרה ל-localStorage ולייצוא JSON גם אם נטענו מקובץ ישן.
- אין שינוי בממשק המשתמש בשלב זה (הכנה לניטור סינתטי בשלבים הבאים).

## 2025-09-29

### שינויים באבטחה
- נוספה פונקציית `escapeHTML` לסינון תווים מיוחדים לפני הזרקה ל־DOM.
- `truncateText` מחזירה טקסט מסונן כברירת מחדל, תוך שמירה על התנהגות קודמת.
- ערכי `value` במודל העריכה (`edit-field-*`) מסוננים לפני הזרקה לתבניות.
- תצוגת היסטוריה (History) מסוננת לפני הזרקה ל־`innerHTML`.
- הגדרת `title` בכרטיסים נעשית דרך DOM API לאחר הרינדור כדי למנוע שבירת HTML.

### הרצה מקומית
- הרצת שרת סטטי מקומי להדגמה: `python -m http.server 5500` ואז גלישה ל־`http://localhost:5500/`.
- פתיחה ישירה דרך `file://` עלולה לחסום `fetch` ל־`projects.json` בטעינה ראשונית.

### בדיקות ידניות מומלצות
- טעינת נתונים ראשונית מ־`projects.json` ושמירה ל־`localStorage`.
- הוספת/עריכת פרויקט עם תווים מיוחדים (`<script>...`, `<img onerror=...>`, תווי `& < > " '`) — חייבים להופיע כטקסט בלבד.
- מחיקת פרויקט ובדיקת עדכון היסטוריה עם חותמת זמן.
- הורדת JSON מעודכן ובדיקה שהוא משקף את מצב הנתונים.
- בדיקת מצב כהה/בהיר נשמר בין רענונים.

### מגבלות ידועות
- בדיקת סטטוס שירותים מתבצעת עם `mode: "no-cors"` ולכן התגובה אטומה. הצעות שיפור:
  - פרוקסי/שרת ביניים לבדיקות סטטוס אמיתיות.
  - סימון תוצאה אטומה כ"לא ידוע" במקום "פעיל".


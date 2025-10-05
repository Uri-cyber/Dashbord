✅ תוכנית בדיקות E2E ידניות
בתור ארכיטקט ראשי, הכנתי לך תוכנית בדיקות ידניות מקיפה ומקצועית.

📋 מסמך בדיקות E2E ידניות - Board Dashboard
מטרת המסמך:
ביצוע בדיקות End-to-End ידניות לוודא תקינות כל הזרימות הקריטיות במערכת.

🎯 Pre-Test Checklist
לפני תחילת הבדיקות, וודא:

 הדפדפן עדכני (Chrome/Firefox/Edge)
 Console פתוח (F12) למעקב אחר errors
 Network tab פעיל לבדיקת requests
 קובץ projects.json תקין וזמין
 LocalStorage ריק (נקה אותו לפני כל סבב)

javascript// הרץ ב-Console לניקוי:
localStorage.clear();
location.reload();

🧪 Test Cases - Critical Flows
TC-001: טעינת דף ראשית
שלבפעולהתוצאה צפויה1פתח את index.html בדפדפןהדף נטען ללא errors בConsole2בדוק כותרת"צוות בדיקות - סטטוס פרויקטים" מוצגת3בדוק כיוון טקסטdir="rtl" ו-lang="he"4בדוק כפתורים5 כפתורים נראים: העלה/Save/שנה עיצוב/הוסף/היסטוריה5בדוק tickerרצועת הטיקר נעה (גם אם ריקה)
✅ Pass Criteria: כל האלמנטים נטענים ללא errors

TC-002: העלאת קובץ JSON
שלבפעולהתוצאה צפויה1לחץ על "העלה קובץ"File picker נפתח2בחר projects.jsonהקובץ נטען3המתן 1 שנייהכרטיסי פרויקטים מוצגים ב-grid4ספור כרטיסיםמספר תואם למספר projects ב-JSON5בדוק Consoleאין errors
Bug Check:
javascript// בדוק ב-Console:
console.log(projectsData); // צריך להראות array
console.log(localStorage.getItem('projectsData')); // צריך להראות JSON string

TC-003: הוספת פרויקט חדש
שלבפעולהתוצאה צפויה1לחץ "הוסף פרויקט"Modal נפתח עם טופס ריק2מלא שם פרויקט: "Test Project"טקסט מוזן3מלא URL: "https://example.com"טקסט מוזן4לחץ "הוסף פרויקט"Modal נסגר5בדוק gridכרטיס חדש נוסף6בדוק כותרת כרטיס"Test Project" מוצג7בדוק URL בכרטיס"https://example.com" מוצג
Validation Test:
נסה להוסיף ללא שם → צריך להציג שגיאה/למנוע submit

TC-004: עריכת פרויקט קיים
שלבפעולהתוצאה צפויה1לחץ על כרטיס פרויקטModal עריכה נפתח2בדוק שדותנתוני הפרויקט טעונים נכון3שנה שם ל-"Updated Project"טקסט משתנה4לחץ "Save"Modal נסגר5בדוק כרטיסשם מעודכן מוצג6טען מחדש דףשינוי נשמר (LocalStorage)
Monitor Tabs Test:

 לחץ על Tab "Tests" → פאנל מתחלף
 לחץ על Tab "API & Auth" → פאנל מתחלף
 לחץ על Tab "Schedule" → פאנל מתחלף


TC-005: מערכת Monitor - הגדרת API
שלבפעולהתוצאה צפויה1פתח עריכת פרויקטModal נפתח2עבור ל-Tab "API & Auth"Tab פעיל3הזן Base URL: "https://jsonplaceholder.typicode.com"טקסט מוזן4סמן "Enable Login Flow"Checkbox מסומן5מלא Username: "test@user.com"טקסט מוזן6מלא Password: "test123"טקסט מוזן7שמורנתונים נשמרים
Security Check:
javascript// בדוק ב-Console:
const data = JSON.parse(localStorage.getItem('projectsData'));
console.log(data[0].monitor.login.password); 
// ⚠️ סיסמה נשמרת בטקסט פשוט - זה OK רק ל-development!

TC-006: יצירת Tests במערכת Monitor
שלבפעולהתוצאה צפויה1בעריכה, לחץ Tab "Tests"פאנל Tests פעיל2בדוק empty state"No tests configured" מוצג3לחץ "Load JSONPlaceholder Example"דוגמה נטענת4בדוק רשימת tests3 tests מוצגים5לחץ "Add test"טופס test חדש נפתח6מלא: Name="Get Users"טקסט מוזן7מלא: Path="/users"טקסט מוזן8בחר Method: GETנבחר9שמור testTest מתווסף לרשימה
Badge Check:

 מספר ה-Badge ליד "Tests" מעודכן (צריך להיות 4)


TC-007: הרצת Tests ידנית
שלבפעולהתוצאה צפויה1בעריכה, Tab "Schedule"פאנל נפתח2לחץ "Run Now"כפתור משתנה ל-"Running..."3המתן לסיוםToast notification מופיע4בדוק toastסטטוס (Pass/Fail/Partial)5בדוק Console NetworkFetch requests נשלחו6סגור Modalחזור לדף ראשי7בדוק כרטיסTests status מעודכן
Expected Network Calls:
GET https://jsonplaceholder.typicode.com/users
GET https://jsonplaceholder.typicode.com/posts/1
POST https://jsonplaceholder.typicode.com/posts

TC-008: מערכת התזמון (Schedule)
שלבפעולהתוצאה צפויה1בעריכה, Tab "Schedule"פאנל נפתח2סמן "Enable automatic schedule"Checkbox מסומן3הזן Interval: 60ערך מוזן4שמורהגדרות נשמרות5המתן 60 שניותTests רצים אוטומטית6בדוק Console"Scheduled monitor run" מופיע
⏰ Timing Test:

רשום זמן Run הראשון
וודא שה-Run הבא מתרחש אחרי 60 שניות בדיוק


TC-009: מחיקת פרויקט
שלבפעולהתוצאה צפויה1פתח עריכת פרויקטModal נפתח2לחץ "Delete project" (אדום)Confirm dialog מופיע3אשר מחיקהModal נסגר4בדוק gridכרטיס נמחק5טען מחדש דףהפרויקט לא חוזר

TC-010: החלפת Theme
שלבפעולהתוצאה צפויה1לחץ "שנה עיצוב"Theme משתנה ל-Dark2בדוק backgroundרקע כהה3בדוק כרטיסיםצבעים התהפכו4לחץ שובחזרה ל-Light theme5טען מחדש דףTheme נשמר
CSS Class Check:
javascript// בדוק ב-Console:
document.body.classList.contains('dark'); // true/false

TC-011: ייצוא JSON
שלבפעולהתוצאה צפויה1לחץ "Save קובץ"קובץ מתחיל להוריד2בדוק Downloadsprojects.json קיים3פתח בעורך טקסטJSON תקין4בדוק מבנהכל ה-projects קיימים5השווה ל-originalנתונים זהים + שינויים

TC-012: היסטוריה
שלבפעולהתוצאה צפויה1בצע פעולות (הוסף/ערוך/מחק)-2לחץ "היסטוריה"Modal היסטוריה נפתח3בדוק רשימהפעולות מופיעות4בדוק timestampזמנים נכונים5סגורModal נסגר

🔥 Negative Tests (בדיקות שליליות)
NT-001: העלאת קובץ לא תקין
1. נסה להעלות קובץ .txt → צריך לדחות
2. נסה להעלות JSON עם syntax error → צריך להציג error
3. נסה להעלות JSON ללא array → צריך לטפל
NT-002: Validation Errors
1. נסה לשמור פרויקט ללא שם → צריך להציג שגיאה
2. נסה URL לא תקין → צריך להציג שגיאה
3. נסה interval שלילי → צריך למנוע
NT-003: Network Errors
1. הגדר Base URL לא קיים: "https://fake-api-999.com"
2. הרץ tests
3. וודא שהמערכת מטפלת ב-network errors
4. בדוק toast: צריך להראות "Fail" עם הסבר
NT-004: CORS Errors
1. נסה API ללא CORS headers
2. וודא שיש טיפול נכון
3. בדוק Console לשגיאות

📱 Responsive Tests (בדיקות נייד)
Mobile View (375px)
1. פתח DevTools (F12)
2. בחר Mobile view (iPhone SE)
3. וודא:
   - Grid משתנה לעמודה אחת
   - כפתורים גלויים וניתנים ללחיצה
   - Modal לא חורג מהמסך
   - טפסים שמישים
Tablet View (768px)
1. שנה ל-iPad
2. וודא:
   - Grid עם 2 עמודות
   - Tabs עובדים
   - Monitor UI שמיש

♿ Accessibility Tests
Keyboard Navigation
1. סגור עכבר
2. השתמש רק ב-Tab/Enter/Escape
3. וודא שניתן:
   - לנווט בין כפתורים
   - לפתוח modals
   - למלא טפסים
   - לסגור modals (Escape)
Screen Reader Simulation
1. בדוק aria-labels
2. וודא שכל כפתור מתואר
3. בדוק שדות טופס עם labels

🐛 Known Issues to Check
LocalStorage Limits
javascript// בדוק ב-Console:
const data = localStorage.getItem('projectsData');
console.log('Size:', (data.length / 1024).toFixed(2), 'KB');
// LocalStorage limit: ~5MB
// אם חורג → צריך לטפל
Memory Leaks
1. פתח Performance Monitor
2. בצע 50 פעולות (הוסף/מחק)
3. בדוק Memory Usage
4. וודא שלא עולה לאין סוף

📊 Test Report Template
markdown# E2E Test Report - Board Dashboard
**Date:** [תאריך]
**Tester:** [שם]
**Browser:** [Chrome/Firefox/Edge] [גרסה]

## Summary
- Total Tests: 12 Core + 4 Negative + 2 Responsive
- Passed: X
- Failed: Y
- Blocked: Z

## Failed Tests
| Test ID | Description | Actual Result | Severity |
|---------|-------------|---------------|----------|
| TC-007 | Run Tests | Toast not showing | High |

## Screenshots
[צרף screenshots של bugs]

## Recommendations
1. ...
2. ...

✅ Final Checklist
לפני שמסיימים את סבב הבדיקות:

 כל 12 ה-Core Tests עברו
 4 Negative Tests בוצעו
 Responsive נבדק (Mobile + Tablet)
 Keyboard navigation עובד
 אין errors בConsole
 אין memory leaks
 LocalStorage לא מלא
 Network requests תקינים
 Screenshots של bugs צורפו
 דו"ח Test Report מולא


🎯 Success Criteria
הפרויקט מוכן ל-Production אם:

✅ 100% של Core Tests עוברים
✅ אין Critical/High bugs
✅ עובד על 3 דפדפנים שונים
✅ Responsive על מובייל/טאבלט
✅ אין errors בConsole
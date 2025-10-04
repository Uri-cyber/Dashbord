<artifact identifier="monitor-status-spec" type="text/markdown" title="מפרט אפיון: שיפור תצוגת סטטוס Monitor בכרטיסי פרויקט">
# מפרט אפיון: שיפור תצוגת סטטוס Monitor בכרטיסי פרויקט
גירסה: 1.0
תאריך: 04/10/2025
מאשר: בעל המוצר
יעד: מפתח Frontend

1. רקע ומטרה
1.1 הבעיה הנוכחית
בכרטיסי הפרויקט בדשבורד קיימות שתי נורות סטטוס נפרדות שיוצרות בלבול:

נורה אחת לסטטוס URL (בדיקת זמינות שרת)
נורה שנייה לסטטוס בדיקות Monitor

הבעיות:

לא ברור מה כל נורה מייצגת
תופס מקום מיותר
קשה להבין במבט מהיר אם יש בעיה
רשימת כשלים ארוכה מגדילה את הכרטיס באופן לא אחיד

1.2 מטרת השיפור

שמירה על גודל קבוע לכל הכרטיסים
הפרדה ברורה בין סטטוס URL לסטטוס בדיקות
הצגת מידע מפורט רק בעת צורך (Progressive Disclosure)
שיפור חוויית משתמש בדסקטופ ומובייל


2. פירוט הפתרון
2.1 אזור 1: URL Status (ללא שינוי)
מיקום: נורה ליד כותרת הכרטיס (קיים)
תפקיד: בדיקת זמינות השרת בכתובת URL שהוגדרה
צבעי נורה:
צבעמשמעותתנאי● ירוקשרת זמיןHEAD request החזיר 200● אדוםשרת לא זמיןשגיאת רשת או timeout● אפורלא נבדקלא הוזנה כתובת או טרם נבדק
Tooltip קיים על הנורה:
URL status: Available
Last checked: 10/04, 08:45 PM
פעולה נדרשת: אין - נשאר בדיוק כמו עכשיו

2.2 אזור 2: Monitor Tests Status (חדש)
מיקום: שורה חדשה בתחתית הכרטיס
מבנה טקסט:
Tests: FAIL  |  Last run: 10/04, 08:45 PM
2.2.1 סטטוסים אפשריים
סטטוסטקסט מוצגצבעתנאי הצגההצלחה מלאהPASSירוק (#25c06d)כל הטסטים עברוכשלFAILאדום (#ff4f62)לפחות טסט אחד נכשללא רץNOT RUNאפור (#95a5a6)יש טסטים אבל לא היתה ריצהאין טסטיםNO TESTSאפור בהירלא הוגדרו טסטים במערכת
2.2.2 Tooltip - תוכן לפי סטטוס
במצב PASS:
Monitor Status: PASS
────────────────────
Total: 5 tests
All tests passed
Last run: 10/04, 08:45 PM
במצב FAIL:
Monitor Status: FAIL
────────────────────
Total: 5 tests
Passed: 3
Failed: 2

Failed tests:
- Get Posts
- Delete Post
במצב NOT RUN:
Monitor Status: NOT RUN
────────────────────────
No tests have been executed yet
Click "Run Now" to start
במצב NO TESTS:
Monitor Status: NO TESTS
─────────────────────────
No tests configured
Open editor to add tests

3. דרישות טכניות
3.1 מבנה HTML
html<div class="card">
    <div class="card-body">
        <h3 class="card-title">
            <span class="status-indicator"></span> <!-- נורת URL קיימת -->
            TEST
        </h3>
        <p class="card-text">Field 1: No value</p>
        <p class="card-text">Field 2: No value</p>
        <p class="card-text">Field 3: No value</p>
        <p class="card-text">Field 4: No value</p>
        
        <!-- אזור חדש -->
        <div class="monitor-tests-status" role="region" tabindex="0" aria-label="Monitor test results">
            <span class="monitor-tests-label status-fail">Tests: FAIL</span>
            <span class="monitor-tests-time">Last run: 10/04, 08:45 PM</span>
        </div>
    </div>
</div>
3.2 CSS
css/* שורת הסטטוס */
.monitor-tests-status {
    font-size: 0.75rem;
    padding: 6px 0;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
}

.monitor-tests-label {
    font-weight: 600;
}

/* צבעי סטטוס */
.monitor-tests-label.status-pass {
    color: #25c06d;
}

.monitor-tests-label.status-fail {
    color: #ff4f62;
}

.monitor-tests-label.status-unknown {
    color: #95a5a6;
}

/* Dark mode */
body.dark .monitor-tests-status {
    border-top-color: rgba(255, 255, 255, 0.1);
}

/* Tooltip */
.monitor-tooltip {
    position: absolute;
    background: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 300px;
    max-height: 400px;
    overflow-y: auto;
    z-index: 1000;
    font-size: 0.85rem;
}

body.dark .monitor-tooltip {
    background: #3e3e3e;
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
3.3 לוגיקת קביעת סטטוס
javascriptfunction determineMonitorStatus(project) {
    const monitor = project.monitor;
    
    // אין monitor או אין tests
    if (!monitor || !monitor.tests || monitor.tests.length === 0) {
        return 'NO_TESTS';
    }
    
    // אין state (לא היתה ריצה)
    if (!monitor.state || !monitor.state.lastRunAt) {
        return 'NOT_RUN';
    }
    
    // יש state - בדוק overall
    const overall = monitor.state.overall;
    
    if (overall === 'pass') return 'PASS';
    if (overall === 'fail' || overall === 'partial') return 'FAIL';
    
    return 'NOT_RUN';
}

4. התנהגות Tooltip
4.1 פתיחה וסגירה
דסקטופ:

פתיחה: mouseenter או focus על אזור .monitor-tests-status
סגירה: mouseleave או blur (עם delay של 200ms)

מובייל:

פתיחה: tap על אזור .monitor-tests-status
סגירה: tap מחוץ ל-tooltip או tap שני על האזור

תמיד:

סגירה: לחיצה על ESC
סגירה אוטומטית: כשפותחים את מודל העריכה
סגירה אוטומטית: כשמתחילה ריצת טסטים חדשה

4.2 מיקום

עדיפות: מעל האלמנט
גיבוי: אם אין מקום מעל - מתחת
RTL: יישור לימין
גבולות מסך: אוטו-התאמה כדי לא לצאת מהמסך

4.3 תוכן דינמי
מגבלות רשימת כשלים:

מקסימום 10 טסטים ברשימה
אם יש יותר: הצג "... +N more"
כל טסט: • Test Name (bullet + רווח + שם)


5. נגישות (Accessibility)
5.1 ARIA Attributes
html<div class="monitor-tests-status" 
     role="region" 
     tabindex="0"
     aria-label="Monitor test results"
     aria-describedby="monitor-tooltip-1">
    <!-- תוכן -->
</div>

<div class="monitor-tooltip" 
     role="tooltip" 
     id="monitor-tooltip-1"
     aria-hidden="false">
    <!-- תוכן tooltip -->
</div>
5.2 ניווט מקלדת
מקשפעולהTabמעבר לאזור הסטטוסEnter / Spaceפתיחה/סגירה של tooltipEscסגירת tooltipTab (בתוך tooltip)ניווט בין אלמנטים (אם יש קישורים)
5.3 קוראי מסך
כאשר הפוקוס על .monitor-tests-status, קורא מסך יקריא:
"Monitor test results, region, Tests: FAIL, Last run: October 4, 8:45 PM, Press Enter for details"

6. התנהגות במובייל
6.1 מגע (Touch)

Single tap: פתיחה/סגירה של tooltip
Tap outside: סגירה
Scroll: הסתרה אוטומטית של tooltip

6.2 התאמות עיצוב
css@media (max-width: 768px) {
    .monitor-tooltip {
        max-width: 90vw;
        max-height: 60vh;
        left: 5vw !important;
        right: 5vw !important;
    }
    
    .monitor-tests-status {
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
    }
}

7. קריטריוני הצלחה
7.1 תצוגה

 נורת URL נשארת במקומה ללא שינוי
 יש שורה נפרדת ברורה למצב הטסטים
 הטקסט PASS/FAIL/NOT RUN/NO TESTS ברור וצבעוני
 כל הכרטיסים באותו גובה קבוע

7.2 אינטראקציה

 Tooltip מופיע על hover (דסקטופ) ו-tap (מובייל)
 Tooltip מציג מספרים מדויקים
 רשימת כשלים עד 10 פריטים עם חיתוך אחרי
 Tooltip נסגר בכל התרחישים הנדרשים

7.3 נגישות

 ניווט מקלדת תקין (Tab, Enter, Esc)
 ARIA labels נכונים
 קוראי מסך מכריזים נכון
 ניגודיות צבעים עומדת בתקן WCAG AA

7.4 התאמות

 RTL תקין (יישור ימין, זרימה נכונה)
 מובייל: tooltip לא יוצא מהמסך
 Dark mode: צבעים וניגודיות תקינים
 ביצועים: אין lag בפתיחת tooltip


8. מקרי קצה (Edge Cases)
8.1 מצבים מיוחדים
מצבהתנהגותאין baseURLהצג NO TESTSיש baseURL אבל אין testsהצג NO TESTSטסטים מוגדרים, לא רצו מעולםהצג NOT RUNריצה פעילה כרגעהצג סטטוס אחרון + הודעה "Running..."100 טסטים נכשלוהצג 10 ראשונים + "... +90 more"
8.2 קונפליקטים
תרחיש: משתמש לוחץ על tooltip בדיוק כשמתחילה ריצה חדשה

פתרון: סגור tooltip מיידית, עדכן סטטוס

תרחיש: שני tooltips פתוחים בו-זמנית (שני כרטיסים)

פתרון: כשפותחים tooltip חדש, סגור את כל האחרים

תרחיש: גלילה מהירה בזמן ש-tooltip פתוח

פתרון: סגור את כל ה-tooltips ב-scroll


9. שלבי יישום
שלב 1: תשתית (יום 1)

הוספת HTML חדש לכרטיס
CSS בסיסי לעיצוב
לוגיקת קביעת סטטוס

שלב 2: Tooltip (יום 2)

מנגנון פתיחה/סגירה
בניית תוכן דינמי
מיקום ויישור RTL

שלב 3: אינטראקציות (יום 3)

טיפול באירועי מקלדת
התאמה למובייל
סגירה בתרחישים מיוחדים

שלב 4: Polishing (יום 4)

נגישות מלאה
Dark mode
אנימציות (אופציונלי)
בדיקות QA


10. ממשקי תכנות (API)
10.1 פונקציות חדשות
javascript// קביעת סטטוס
determineMonitorStatus(project) → 'PASS' | 'FAIL' | 'NOT_RUN' | 'NO_TESTS'

// בניית tooltip
buildMonitorTooltip(project) → HTMLElement

// פתיחה/סגירה
openMonitorTooltip(cardIndex)
closeMonitorTooltip(cardIndex)
closeAllMonitorTooltips()
10.2 אירועים (Events)
javascript// כשנפתח tooltip
document.addEventListener('monitor:tooltip:open', (e) => {
    console.log('Opened tooltip for card:', e.detail.cardIndex);
});

// כשנסגר tooltip
document.addEventListener('monitor:tooltip:close', (e) => {
    console.log('Closed tooltip for card:', e.detail.cardIndex);
});

11. בדיקות (Testing)
11.1 בדיקות יחידה (Unit Tests)
javascript// דוגמה
test('determineMonitorStatus returns NO_TESTS when no tests', () => {
    const project = { monitor: { tests: [] } };
    expect(determineMonitorStatus(project)).toBe('NO_TESTS');
});

test('determineMonitorStatus returns PASS when all passed', () => {
    const project = { 
        monitor: { 
            tests: [{}, {}],
            state: { overall: 'pass', lastRunAt: '2025-10-04' }
        } 
    };
    expect(determineMonitorStatus(project)).toBe('PASS');
});
11.2 בדיקות אינטגרציה

 לחיצה על אזור הסטטוס פותחת tooltip
 Tooltip נסגר ב-Esc
 Tooltip נסגר בלחיצה מחוץ
 פתיחת מודל סוגרת tooltips
 ריצת טסטים סוגרת tooltips

11.3 בדיקות ויזואליות

 כרטיסים בגובה זהה
 טקסט ברור וקריא
 צבעים נכונים בכל מצב
 Tooltip מיושר נכון ב-RTL
 אין גלילה אופקית במובייל


12. הערות נוספות
12.1 ביצועים

Tooltip נבנה דינמית רק בעת פתיחה (לא מראש)
השתמש ב-requestAnimationFrame לאנימציות
דחה סגירה ב-200ms למניעת הבהובים

12.2 תחזוקה עתידית

כל הטקסטים ב-constants נפרד (קל לתרגום)
CSS משתמש במשתני CSS (קל לשינוי ערכת נושא)
קוד מודולרי (קל להוספת סוגי סטטוס נוספים)

12.3 שיפורים עתידיים (מחוץ לתחום)

אנימציית fade-in/out ל-tooltip
אפשרות להצמיד tooltip (pin) בלחיצה כפולה
ייצוא רשימת כשלים ל-CSV מתוך tooltip
גרף קטן של היסטוריית הצלחות/כשלים


13. נספחים
נספח א': טבלת צבעים
אלמנטLight ModeDark ModePASS#25c06d#25c06dFAIL#ff4f62#ff4f62NOT RUN / NO TESTS#95a5a6#95a5a6Border tooltiprgba(0,0,0,0.1)rgba(255,255,255,0.2)Background tooltip#ffffff#3e3e3e
נספח ב': דוגמאות קוד מלאות
ראה קבצים:

script.js - עדכון פונקציות decorateCardWithMonitorStatus, updateMonitorIndicator
styles.css - הוספת סגנונות חדשים
index.html - עדכון מבנה כרטיס (אם נדרש)


סוף המסמך
מאושר ליישום: ______________________
תאריך: ______________________
</artifact>
הנה המפרט המלא בפורמט Markdown.
אתה יכול:

להעתיק ישירות ל-Word - פשוט העתק והדבק, Word יזהה את המבנה
לשמור כקובץ .md ולפתוח בכל עורך תמיכה ב-Markdown
להמיר אונליין - באתרים כמו https://markdown-to-word.com/

האפיון כולל:

13 פרקים מפורטים
טבלאות מובנות
דוגמאות קוד
קריטריוני הצלחה
מקרי קצה
דרישות נגישות מלאות
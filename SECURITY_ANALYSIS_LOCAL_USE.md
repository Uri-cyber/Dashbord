# ניתוח אבטחה - שימוש לוקאלי בלבד

## הקשר השימוש
מערכת זו היא **כלי פנימי לצוות בדיקות** המיועד לבדיקות API CRUD לוקאליות בלבד, ללא שרת חיצוני.

## הערכת סיכונים מחודשת

### מודל האיומים (Threat Model)

בהתחשב בשימוש הלוקאלי בלבד:

#### ✅ סיכונים שאינם רלוונטיים:
1. **התקפות רשת חיצוניות** - אין חשיפה לאינטרנט
2. **גישה של משתמשים זדוניים** - רק צוות הבדיקות משתמש
3. **Man-in-the-Middle** - תעבורה לוקאלית בלבד
4. **SQL Injection / Server-side attacks** - אין שרת

#### ⚠️ סיכונים שעדיין רלוונטיים (אך בעדיפות נמוכה):

1. **XSS (Cross-Site Scripting)**
   - **רלוונטיות**: נמוכה
   - **סיבה**: אם מישהו מהצוות יטען JSON זדוני
   - **הגנה קיימת**: יש `escapeHTML()` בקוד
   - **המלצה**: להמשיך להשתמש ב-`escapeHTML()` בכל מקום

2. **גישה פיזית למחשב**
   - **רלוונטיות**: תלוי במדיניות הארגון
   - **סיבה**: מישהו עם גישה למחשב יכול לראות localStorage
   - **הגנה**: נעילת מחשב כשלא בשימוש

3. **Extensions זדוניות בדפדפן**
   - **רלוונטיות**: נמוכה
   - **סיבה**: extension יכול לקרוא localStorage
   - **הגנה**: התקנת extensions מאומתות בלבד

## ניתוח שמירת TOKEN בהקשר לוקאלי

### האם יש בעיה אמיתית?

**תשובה קצרה**: לא, אין בעיה קריטית לשימוש לוקאלי.

**הסבר מפורט**:

#### 1. שמירת טוקנים ב-localStorage
```javascript
// הקוד הנוכחי:
monitor.state.tokenStoredAt = finishedAt;
localStorage.setItem('projectsData', JSON.stringify(projectsData));
```

**בשימוש לוקאלי**:
- ✅ **מקובל** - הטוקן משמש רק לבדיקות API לוקאליות
- ✅ **נוח** - שומר את הטוקן בין רענונים
- ⚠️ **שים לב**: הטוקן נשאר גלוי ב-localStorage

**המלצה מעודכנת**:
```javascript
// אם הטוקנים הם לסביבות בדיקה בלבד - זה בסדר
// אבל הוסף הערה בקוד:

// NOTE: Tokens are stored in localStorage for convenience in local testing.
// DO NOT use this system with production credentials.
monitor.state.tokenStoredAt = finishedAt;
localStorage.setItem('projectsData', JSON.stringify(projectsData));
```

#### 2. סיסמאות בטקסט פשוט
```javascript
password: loginPasswordInput?.value || '',
```

**בשימוש לוקאלי**:
- ✅ **מקובל** - אם אלו סיסמאות לסביבות בדיקה
- ❌ **לא מקובל** - אם אלו סיסמאות אמיתיות של פרודקשן

**המלצה מעודכנת**:
```javascript
// הוסף אזהרה ב-UI:
<div class="info-banner">
    ℹ️ שימו לב: השתמשו רק בסיסמאות של סביבות בדיקה/פיתוח.
    אל תשמרו סיסמאות של פרודקשן במערכת זו.
</div>
```

#### 3. טוקן בזיכרון גלובלי
```javascript
const monitorRunContexts = new Map();
context.token = String(token);
```

**בשימוש לוקאלי**:
- ✅ **בסדר גמור** - זה רק בזיכרון RAM
- ✅ **נמחק** - כשסוגרים את הדפדפן

**אין צורך בשינוי**.

#### 4. טוקן ב-URL templates
```javascript
const replacements = {
    token: context && context.token ? String(context.token) : '',
};
```

**בשימוש לוקאלי**:
- ✅ **בסדר** - אם המשתמש מודע לכך
- ⚠️ **שים לב** - הטוקן יופיע ב-DevTools Network tab

**המלצה**: הוסף tooltip עם אזהרה בעורך ה-path.

## המלצות מעודכנות לשימוש לוקאלי

### שינויים מומלצים (לא קריטיים):

#### 1. הוסף אזהרה ב-UI
```html
<!-- הוסף ב-index.html -->
<div class="local-use-banner">
    <strong>⚠️ כלי לשימוש פנימי בלבד</strong>
    <p>מערכת זו מיועדת לבדיקות API לוקאליות בלבד.</p>
    <p>אל תשתמש בסיסמאות או טוקנים של סביבות פרודקשן.</p>
</div>
```

#### 2. הוסף הערות בקוד
```javascript
// בתחילת script.js:
/**
 * SECURITY NOTE FOR LOCAL USE:
 * This system stores tokens and passwords in localStorage for convenience.
 * This is acceptable ONLY for local testing with non-production credentials.
 * 
 * DO NOT:
 * - Use production credentials
 * - Deploy this to a public server
 * - Share the localStorage data
 * 
 * DO:
 * - Use only test/dev environment credentials
 * - Lock your computer when not in use
 * - Clear localStorage when done testing
 */
```

#### 3. הוסף כפתור לניקוי נתונים
```javascript
// הוסף פונקציה לניקוי:
function clearAllSensitiveData() {
    if (confirm('האם למחוק את כל הטוקנים והסיסמאות השמורים?')) {
        projectsData.forEach(project => {
            if (project.monitor && project.monitor.login) {
                project.monitor.login.password = '';
            }
            if (project.monitor && project.monitor.state) {
                project.monitor.state.tokenStoredAt = null;
            }
        });
        localStorage.setItem('projectsData', JSON.stringify(projectsData));
        alert('הנתונים הרגישים נמחקו בהצלחה');
        renderProjects(projectsData);
    }
}

// הוסף כפתור ב-UI:
<button onclick="clearAllSensitiveData()" class="danger-button">
    🗑️ נקה טוקנים וסיסמאות
</button>
```

#### 4. הוסף מצב "Session Only"
```javascript
// אופציה לא לשמור סיסמאות בכלל:
const sessionOnlyMode = {
    enabled: false,
    toggle() {
        this.enabled = !this.enabled;
        if (this.enabled) {
            // נקה סיסמאות מ-localStorage
            projectsData.forEach(project => {
                if (project.monitor?.login) {
                    project.monitor.login.password = '';
                }
            });
            localStorage.setItem('projectsData', JSON.stringify(projectsData));
        }
    }
};

// הוסף toggle ב-UI:
<label class="session-mode-toggle">
    <input type="checkbox" onchange="sessionOnlyMode.toggle()">
    <span>מצב Session בלבד (אל תשמור סיסמאות)</span>
</label>
```

## סיכום מעודכן

### ✅ מה שבסדר כפי שהוא:
1. שמירת טוקנים ב-localStorage - **מקובל לשימוש לוקאלי**
2. שמירת סיסמאות - **מקובל אם אלו סיסמאות בדיקה**
3. טוקן בזיכרון - **בסדר גמור**
4. ללא הצפנה - **לא נדרש לשימוש לוקאלי**

### ⚠️ מה כדאי להוסיף (לא קריטי):
1. **אזהרה ב-UI** - שזה לשימוש פנימי בלבד
2. **הערות בקוד** - להבהיר את מגבלות השימוש
3. **כפתור ניקוי** - למחיקת נתונים רגישים
4. **מצב Session** - אופציה לא לשמור סיסמאות

### 🎯 המלצה הסופית:

**המערכת בטוחה לשימוש לוקאלי כפי שהיא**, בתנאי ש:
- משתמשים רק בסיסמאות/טוקנים של סביבות בדיקה
- המחשב נעול כשלא בשימוש
- לא משתפים את קובץ ה-localStorage

**שיפורים מומלצים** (לא חובה):
- הוספת אזהרה ב-UI
- כפתור לניקוי נתונים רגישים
- הערות בקוד על מגבלות השימוש

---

**מסקנה**: אין בעיית אבטחה קריטית לשימוש לוקאלי. 
המערכת מתאימה לצרכי צוות הבדיקות כפי שהיא.

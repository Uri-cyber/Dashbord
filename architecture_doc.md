# 🏗️ Architecture Documentation
## דשבורד צוות בדיקות - Testing Team Dashboard

**Version:** 1.0  
**Last Updated:** 2025-10-05  
**Type:** Client-Side SPA (Single Page Application)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Layer Architecture](#layer-architecture)
4. [Module Structure](#module-structure)
5. [Data Flow](#data-flow)
6. [State Management](#state-management)
7. [Monitor System Architecture](#monitor-system-architecture)
8. [Design Patterns](#design-patterns)
9. [File Structure](#file-structure)
10. [Key Components](#key-components)

---

## 🎯 Overview

### Purpose
A local-only, RTL-enabled dashboard for QA teams to manage projects and perform synthetic API monitoring with scheduling capabilities.

### Key Characteristics
```
✓ Client-Side Only (No Backend)
✓ Static SPA (HTML + CSS + Vanilla JS)
✓ localStorage Persistence
✓ RTL/Hebrew Support
✓ Dark Mode
✓ Accessibility (ARIA)
✓ No External Dependencies
```

### Tech Stack
```
HTML5:     Semantic structure, ARIA
CSS3:      Grid, Flexbox, Custom Properties, Dark Mode
JavaScript: ES6+, Async/Await, Fetch API
Storage:   localStorage
```

---

## 🏛️ System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACE                          │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐       │
│  │ Cards   │  │ Modals   │  │ Toasts  │  │ Tooltips │       │
│  └─────────┘  └──────────┘  └─────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│                   BUSINESS LOGIC                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Project CRUD│  │ Monitor Core │  │  Validation  │        │
│  └─────────────┘  └──────────────┘  └──────────────┘        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Test Engine │  │  Scheduler   │  │ Edit Context │        │
│  └─────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                             │
│  ┌─────────────────┐           ┌───────────────────┐        │
│  │  localStorage   │  ←──────→ │  In-Memory State  │        │
│  │  - projectsData │           │  - Maps/Sets      │        │
│  │  - history      │           │  - WeakMaps       │        │
│  │  - darkMode     │           │  - Contexts       │        │
│  └─────────────────┘           └───────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Layer Architecture

### 1. Presentation Layer

**Responsibility:** User interface and interaction

**Components:**
```
├─ HTML Structure (index.html)
│  ├─ Header (title, ticker)
│  ├─ Main Content
│  │  ├─ Projects Grid
│  │  └─ Connectivity Warning
│  ├─ Modals
│  │  ├─ Edit Modal (Monitor Tabs)
│  │  ├─ Add Modal
│  │  └─ History Modal
│  └─ Footer (action buttons)
│
├─ CSS Styling (styles.css)
│  ├─ Layout (Grid, Flexbox)
│  ├─ Theme System (Dark/Light)
│  ├─ RTL Support
│  ├─ Components (Cards, Modals, Toasts)
│  └─ Animations
│
└─ Dynamic UI (script.js)
   ├─ Card Rendering
   ├─ Modal Management
   ├─ Toast Notifications
   └─ Tooltip System
```

**Key Features:**
- **Responsive Grid:** `repeat(auto-fill, minmax(280px, 1fr))`
- **RTL Support:** `dir="rtl"` with proper CSS
- **Dark Mode:** CSS custom properties toggle
- **Accessibility:** ARIA attributes, keyboard navigation

---

### 2. Business Logic Layer

**Responsibility:** Application logic and workflows

**Modules:**

#### A. Core Module
```javascript
// Global State
let projectsData = [];
let currentProjectIndex = null;
let projectHistory = [];

// Security
function escapeHTML(str) { ... }

// Lifecycle
window.addEventListener('load', initialize);
```

#### B. Project Management Module
```javascript
// CRUD Operations
function saveNewProject() { ... }
function saveEdit() { ... }
function deleteProject(index) { ... }

// Rendering
function renderProjects() { ... }
function renderProjectCard(project, index) { ... }
```

#### C. Monitor System Module
```javascript
// Core Components
const DEFAULT_MONITOR_TEMPLATE = { ... };
function createDefaultMonitor() { ... }

// Execution Engine
async function runProjectChecks(index, options) { ... }
async function performLogin(project, context) { ... }
async function executeTest(project, test, context, index) { ... }

// Network Layer
async function monitorFetch(url, options, context) { ... }
function buildMonitorUrl(baseUrl, path) { ... }
function buildHeaders(baseHeaders, extraHeaders) { ... }

// Template System
function renderMonitorTemplate(template, project, context) { ... }

// Scheduler
function startMonitorScheduler() { ... }
function runScheduledMonitorCycle() { ... }
```

#### D. Edit Context Module
```javascript
const monitorEditContext = {
    isEditing: false,
    dirty: false,
    hasValidationErrors: false,
    projectIndex: null,
    originalMonitor: null,
    tests: [],
    boundListeners: []
};

// Lifecycle
function enterMonitorEditMode(project) { ... }
function exitMonitorEditMode() { ... }

// Tests Editor
function renderMonitorTestsEditor() { ... }
function handleTestAdd() { ... }
function handleTestDelete(index) { ... }
function handleTestDuplicate(index) { ... }
```

---

### 3. Data Layer

**Responsibility:** State persistence and management

**Storage Structure:**

```javascript
// localStorage Schema
{
    "projectsData": [
        {
            "name": "Project Name",
            "url": "https://...",
            "fieldNames": { "1": "Owner", "2": "Status", ... },
            "fields": { "1": "John", "2": "Active", ... },
            "monitor": {
                "baseUrl": "https://api.example.com",
                "login": {
                    "enabled": false,
                    "path": "/auth/login",
                    "method": "POST",
                    "username": "",
                    "password": "",
                    "bodyTemplate": "...",
                    "tokenLocation": "json:token",
                    "tokenHeaderName": "Authorization",
                    "tokenPrefix": "Bearer ",
                    "persistPassword": true
                },
                "tests": [
                    {
                        "id": "test-123",
                        "name": "Get Users",
                        "required": false,
                        "requiresLogin": true,
                        "method": "GET",
                        "path": "/users",
                        "expectedStatus": [200],
                        "bodyTemplate": "",
                        "headers": {}
                    }
                ],
                "schedule": {
                    "enabled": false,
                    "intervalSec": 3600
                },
                "state": {
                    "lastRunAt": "2025-10-05T...",
                    "overall": "pass",
                    "tests": {
                        "test-123": {
                            "status": "pass",
                            "lastCode": 200,
                            "lastError": null
                        }
                    },
                    "failures": [],
                    "tokenStoredAt": "2025-10-05T...",
                    "lastCreatedId": null
                }
            }
        }
    ],
    "projectHistory": [
        {
            "date": "2025-10-05T...",
            "type": "add",
            "description": "Added project: ..."
        }
    ],
    "darkMode": true
}
```

**In-Memory State:**

```javascript
// Maps & Sets
const monitorRunControllers = new Map();     // index → AbortController
const monitorRunningProjects = new Set();    // Set<index>
const monitorRunContexts = new Map();        // index → RunContext

// WeakMaps (prevent memory leaks)
const monitorTabsState = new WeakMap();      // container → TabsState

// Contexts
const monitorEditContext = { ... };          // Edit session state
const monitorToastState = { ... };           // Toast management
const monitorTestsTooltipState = { ... };    // Tooltip state
```

---

## 🔄 Data Flow

### Project CRUD Flow

```
User Action (Add/Edit/Delete)
         ↓
  Event Handler
         ↓
  Validation
         ↓
  State Update (projectsData)
         ↓
  History Log (addToHistory)
         ↓
  Persist (localStorage)
         ↓
  Re-render (renderProjects)
         ↓
  Update UI
```

### Monitor Execution Flow

```
User clicks "Run Now"
         ↓
handleMonitorRunClick(index)
         ↓
runProjectChecks(index, options)
         ↓
┌────────────────────────────────┐
│ 1. Create Run Context          │
│ 2. Begin Run (UI update)       │
│ 3. Login Flow (if enabled)     │
│    - performLogin()             │
│    - Extract token              │
│ 4. Execute Tests (sequential)  │
│    - executeTest() for each    │
│    - Track results             │
│ 5. Compute Overall Status      │
│ 6. Persist Results             │
│ 7. Update Indicators           │
│ 8. Show Toast                  │
│ 9. End Run (cleanup)           │
└────────────────────────────────┘
```

### Scheduler Flow

```
setInterval (every 10s)
         ↓
runScheduledMonitorCycle()
         ↓
For each project:
  - Check if schedule.enabled
  - Check if due (lastRunAt + interval)
  - Skip if already running
  - Skip if being edited
         ↓
runProjectChecks(index, {mode: 'schedule'})
         ↓
Same execution flow as manual run
```

---

## 🎛️ State Management

### Global State

```javascript
// Project Data
let projectsData = [];           // Master data array
let currentProjectIndex = null;  // Currently editing

// History
let projectHistory = [];         // Action log

// Monitor Runtime
const monitorRunningProjects = new Set();    // Running checks
const monitorRunControllers = new Map();     // Abort controllers
const monitorRunContexts = new Map();        // Execution contexts

// Scheduler
let monitorScheduleTimerId = null;  // Interval ID
```

### Edit Context State

```javascript
const monitorEditContext = {
    isEditing: boolean,           // Edit mode active?
    dirty: boolean,               // Unsaved changes?
    hasValidationErrors: boolean, // Invalid input?
    projectIndex: number,         // Which project
    originalMonitor: object,      // Original state
    tests: array,                 // Working tests copy
    boundListeners: array         // Cleanup tracking
};
```

### Run Context State

```javascript
{
    index: number,                // Project index
    buttons: {                    // UI references
        card: HTMLElement,
        modal: HTMLElement
    },
    controllers: Set,             // Request controllers
    startedAt: string,            // ISO timestamp
    token: string,                // Auth token
    tokenKind: string,            // json:path or header:
    lastCreatedId: any,           // Last POST response ID
    aborted: boolean,             // Canceled?
    mode: 'manual'|'schedule',    // How triggered
    loginResult: object,          // Login outcome
    runController: AbortController, // Master abort
    source: 'card'|'modal'        // Where triggered
}
```

---

## 🔍 Monitor System Architecture

### Components Hierarchy

```
Monitor System
├─ Configuration
│  ├─ baseUrl
│  ├─ login (optional)
│  ├─ tests[]
│  └─ schedule (optional)
│
├─ Execution Engine
│  ├─ Run Context Management
│  ├─ Login Flow
│  │  ├─ Template Rendering
│  │  ├─ Token Extraction
│  │  └─ Token Storage
│  ├─ Test Execution
│  │  ├─ Sequential Processing
│  │  ├─ Status Validation
│  │  └─ Result Collection
│  └─ Result Persistence
│
├─ Network Layer
│  ├─ monitorFetch (with AbortController)
│  ├─ Timeout Management (15s)
│  ├─ Error Handling
│  └─ CORS Detection
│
├─ Scheduler
│  ├─ Interval Polling (10s)
│  ├─ Due Time Calculation
│  └─ Auto-execution
│
└─ UI Integration
   ├─ Status Indicators
   ├─ Toast Notifications
   ├─ Run Buttons (sync state)
   └─ Progress Tracking
```

### Template System

```javascript
// Supported Placeholders
${username}      → login.username
${password}      → login.password
${token}         → context.token (from login)
${timestamp}     → context.startedAt (ISO)
${random}        → Math.random() * 1000000
${lastCreatedId} → context.lastCreatedId (from POST)

// Usage
bodyTemplate: '{"user":"${username}","pass":"${password}"}'
path: '/users/${lastCreatedId}/posts'

// Rendering
function renderMonitorTemplate(template, project, context) {
    // Regex: /\$\{([a-zA-Z0-9_]+)\}/g
    // Secure: Only alphanumeric placeholders
}
```

### Login Flow

```
1. Check if login.enabled
         ↓
2. Validate baseUrl exists
         ↓
3. Build login URL (baseUrl + login.path)
         ↓
4. Render bodyTemplate with ${username}, ${password}
         ↓
5. Execute HTTP request (with timeout)
         ↓
6. Extract token via tokenLocation:
   - "json:path.to.token" → JSON path extraction
   - "header:Authorization" → Header extraction
         ↓
7. Store token in context
         ↓
8. Return login result (success/error)
```

### Test Execution

```
For each test in tests[]:
    ↓
1. Check prerequisites:
   - baseUrl exists?
   - requiresLogin → token exists?
         ↓
2. Build request:
   - URL = baseUrl + path (template rendered)
   - Headers = base + test headers
   - Body = bodyTemplate (if POST/PUT/PATCH)
   - Add token header (if requiresLogin)
         ↓
3. Execute HTTP request (with timeout)
         ↓
4. Validate response:
   - statusCode in expectedStatus[]?
         ↓
5. Extract lastCreatedId (if POST and successful)
         ↓
6. Return result:
   {
       id, name, required,
       status: 'pass'|'fail'|'unknown',
       lastCode, lastError
   }
```

---

## 🎨 Design Patterns

### 1. Factory Pattern
```javascript
// Monitor creation
function createDefaultMonitor() {
    return JSON.parse(monitorTemplateJSON);
}
```

### 2. Template Method
```javascript
// Template rendering with placeholders
function renderMonitorTemplate(template, project, context) {
    return str.replace(/\$\{([a-zA-Z0-9_]+)\}/g, ...);
}
```

### 3. Observer Pattern
```javascript
// Event listener management
function addMonitorEditListener(element, event, handler) {
    element.addEventListener(event, handler);
    monitorEditContext.boundListeners.push({element, event, handler});
}
```

### 4. Singleton Pattern
```javascript
// Global state instances
let projectsData = [];  // Single source of truth
```

### 5. State Container
```javascript
// Encapsulated state
const monitorEditContext = {
    isEditing: false,
    dirty: false,
    // ...
};
```

### 6. WeakMap for Memory Safety
```javascript
// DOM element references
const monitorTabsState = new WeakMap();
// Automatically garbage collected when element removed
```

### 7. AbortController Pattern
```javascript
// Request lifecycle management
function trackMonitorRunController(context, controller) {
    const entry = {
        controller,
        timeoutId: setTimeout(() => controller.abort(), 15000)
    };
    context.controllers.add(entry);
    return entry;
}
```

---

## 📁 File Structure

```
board/
├── index.html          (400 lines)  UI structure, modals
├── styles.css          (1200 lines) Styling, dark mode, RTL
├── script.js           (3700 lines) Application logic
│   ├── Global State    (50 lines)
│   ├── Monitor Core    (800 lines)
│   ├── UI Components   (600 lines)
│   ├── Edit System     (700 lines)
│   ├── Tabs System     (300 lines)
│   ├── Tooltips        (400 lines)
│   ├── Project CRUD    (400 lines)
│   └── Utilities       (450 lines)
├── projects.json       Sample data
├── README.md           Documentation
├── SECURITY.md         Security guide
└── CHANGES.md          Change log
```

---

## 🔧 Key Components

### 1. Modal System

```javascript
// Three modals
- Edit Modal:    Project editing + Monitor configuration
- Add Modal:     New project creation
- History Modal: Activity log

// Lifecycle
openEditModal(index) → setupMonitorTabs() → populateMonitorTabs()
closeEditModal()     → teardownMonitorTabs() → cleanup
```

### 2. Tabs System

```javascript
// ARIA-compliant tabs
const monitorTabsState = new WeakMap();  // container → state

setupMonitorTabs(container)
├─ Initialize ARIA attributes
├─ Bind keyboard navigation (←/→/Enter)
├─ Store state in WeakMap
└─ Activate default tab

activateMonitorTab(container, tab)
├─ Update aria-selected
├─ Show/hide panels
└─ Focus management
```

### 3. Toast Notification System

```javascript
showMonitorToast(status, title, body)
├─ Create toast element
├─ Apply variant class (pass/fail/partial/unknown)
├─ Append to container
├─ Auto-remove after 6s
└─ Fade-out animation

// Singleton container
const monitorToastState = { container: null };
```

### 4. Tooltip System

```javascript
// Two tooltip types:
1. Monitor Tests Tooltip (detailed failure info)
2. Monitor Chip Tooltip (quick status)

// Features:
- RTL-aware positioning
- Touch/desktop interaction
- Click-outside to close
- Escape key to close
- Scroll/resize handlers
```

### 5. Validation System

```javascript
// Real-time validation
function collectMonitorFromForm(modal, project)
├─ Clear previous errors
├─ Validate each field
│  ├─ URL format (with new URL())
│  ├─ Protocol whitelist
│  ├─ Token location pattern
│  ├─ Expected status (CSV numbers)
│  ├─ Headers format (key:value)
│  └─ Schedule interval (30-3600)
├─ Show field errors (inline)
├─ Focus first invalid field
└─ Return validated data or null
```

---

## 🔐 Security Architecture

### XSS Prevention

```javascript
// 1. Input Sanitization
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;  // Auto-escapes
    return div.innerHTML;
}

// 2. Safe DOM Manipulation
element.textContent = userInput;  // NOT innerHTML

// 3. Template Placeholder Limiting
/\$\{([a-zA-Z0-9_]+)\}/g  // Only safe chars
```

### Memory Management

```javascript
// 1. WeakMap for DOM references
const monitorTabsState = new WeakMap();
// Auto garbage-collected

// 2. Event Listener Cleanup
function removeMonitorEditListeners() {
    boundListeners.forEach(({element, event, handler}) => {
        element.removeEventListener(event, handler);
    });
}

// 3. AbortController Cleanup
function endMonitorRun(index, context) {
    context.controllers.forEach(entry => {
        clearTimeout(entry.timeoutId);
        entry.controller.abort();
    });
    context.controllers.clear();
}
```

---

## 📊 Performance Considerations

### Optimizations

```javascript
// 1. Object.freeze for immutable templates
const DEFAULT_MONITOR_TEMPLATE = Object.freeze({...});

// 2. Event delegation (where possible)
// 3. requestAnimationFrame for animations
// 4. Debounced resize/scroll handlers
// 5. Minimal DOM queries (cache references)
```

### Resource Management

```javascript
// Request timeout: 15 seconds
const MONITOR_REQUEST_TIMEOUT_MS = 15000;

// Scheduler interval: 10 seconds
const MONITOR_SCHEDULE_POLL_INTERVAL_MS = 10000;

// localStorage: ~5-10MB browser limit
// (no enforced limit, handled gracefully)
```

---

## 🎯 Extension Points

### How to Add Features

#### 1. New Field Type
```javascript
// 1. Add to DEFAULT_MONITOR_TEMPLATE
// 2. Add input in populateMonitorTabs()
// 3. Add collection in collectMonitorFromForm()
// 4. Add validation if needed
```

#### 2. New Test Type
```javascript
// 1. Add to MONITOR_ALLOWED_METHODS
// 2. Update createTestEditorCard()
// 3. Update executeTest() logic
```

#### 3. New Storage Backend
```javascript
// Replace localStorage calls:
function saveToStorage(key, data) {
    // Could be: IndexedDB, Cloud Sync, File System API
}
```

---

## 📝 Best Practices in Code

### Naming Conventions
```
- Functions: camelCase (renderProjects)
- Constants: UPPER_SNAKE_CASE (DEFAULT_MONITOR_TEMPLATE)
- Global vars: camelCase (projectsData)
- CSS classes: kebab-case (monitor-test-card)
- DOM IDs: kebab-case (edit-modal)
```

### Error Handling
```javascript
// Always wrapped in try-catch
try {
    localStorage.setItem('projectsData', JSON.stringify(projectsData));
} catch (error) {
    console.warn('Failed to persist:', error);
    // Graceful degradation
}
```

### Async Patterns
```javascript
// Proper async/await with error handling
async function runProjectChecks(index, options) {
    try {
        // ... async operations
    } catch (error) {
        console.error('Run failed:', error);
    } finally {
        endMonitorRun(index, context);  // Always cleanup
    }
}
```

---

## 🚀 Future Architecture Considerations

### Potential Improvements

1. **Module System**
   ```javascript
   // Current: Single 3700-line file
   // Future: ES6 modules
   import { MonitorCore } from './modules/monitor-core.js';
   import { ProjectCRUD } from './modules/project-crud.js';
   ```

2. **State Management Library**
   ```javascript
   // Consider Redux/Zustand for complex state
   // Current singleton pattern works for now
   ```

3. **TypeScript Migration**
   ```typescript
   interface Project {
       name: string;
       url?: string;
       monitor: MonitorConfig;
   }
   ```

4. **Web Components**
   ```javascript
   class MonitorCard extends HTMLElement {
       // Encapsulated card component
   }
   ```

5. **Service Worker**
   ```javascript
   // Offline support
   // Background sync for scheduled tests
   ```

---

## 📚 References

### Related Documentation
- [README.md](README.md) - User guide
- [SECURITY.md](SECURITY.md) - Security practices
- [CHANGES.md](CHANGES.md) - Version history

### External Standards
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)

---

**Document Version:** 1.0  
**Generated:** 2025-10-05  
**Maintained by:** AI Development Team and Alex_Y

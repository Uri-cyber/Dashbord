# Script.js Module Map

## Overview
`script.js` is a large file (150KB, ~4,100 lines) with complex interdependencies.
Full modularization has been analyzed but deferred due to circular dependencies.

## Current Modular Structure

### ✅ Extracted Modules (Already Created)
- `js/config.js` (2.3KB) - Configuration constants
- `js/utils.js` (8.6KB) - Utility functions
- `js/storage.js` (4.3KB) - localStorage operations

### 📋 script.js Internal Organization

The main script.js file is organized into these logical sections:

#### **Section 1: Global State (Lines 96-100)**
```javascript
let projectsData = [];
let pageTitle = '...';
let currentProjectIndex = null;
let projectHistory = [];
```

#### **Section 2: Monitor Configuration (Lines 102-500)**
- Default templates
- Timeout constants
- Run state management
- Button management

#### **Section 3: API & Testing (Lines 500-1,100)**
- `monitorFetch()` - HTTP requests
- `performLogin()` - Authentication
- `executeTest()` - Test execution
- `runProjectChecks()` - Main test runner
- `handleMonitorRunClick()` - User-triggered runs

#### **Section 4: Scheduling (Lines 1,095-1,136)**
- `runScheduledMonitorCycle()` - Check for due tests
- `startMonitorScheduler()` - Start scheduler
- `stopMonitorScheduler()` - Stop scheduler

#### **Section 5: UI - Tooltips & Status (Lines 1,138-1,800)**
- Tests tooltip management
- Status chip tooltip
- Indicator updates
- Toast notifications

#### **Section 6: UI - Tabs & Forms (Lines 1,815-2,080)**
- Tab system (Tests, API & Auth, Schedule)
- Form field helpers
- Input validation

#### **Section 7: Monitor Editor (Lines 2,200-3,000)**
- Edit mode management
- Test card rendering
- Form collection
- Validation

#### **Section 8: Modals (Lines 3,388-3,874)**
- `openEditModal()` - Edit project
- `openAddModal()` - Add project
- `openHistoryModal()` - View history
- Save/delete operations

#### **Section 9: Rendering (Lines 3,215-3,386)**
- `renderProjects()` - Main card rendering
- `renderHotItems()` - Ticker
- Card decoration

#### **Section 10: Event Handlers (Lines 3,206-3,932)**
- Theme toggle
- File upload/download
- History tracking
- Input validation

#### **Section 11: Initialization (Lines 3,934-4,125)**
- Window load event
- localStorage loading
- Scheduler start
- Status checking

## Function Reference by Feature

### 🔐 Authentication & API
| Function | Lines | Purpose |
|----------|-------|---------|
| `performLogin()` | 779-865 | Handle JWT/token authentication |
| `monitorFetch()` | 746-777 | Wrapper for fetch with timeout |
| `executeTest()` | 867-964 | Execute single API test |
| `runProjectChecks()` | 978-1093 | Run all tests for a project |

### 🎨 UI Rendering
| Function | Lines | Purpose |
|----------|-------|---------|
| `renderProjects()` | 3284-3386 | Render all project cards |
| `decorateCardWithMonitorStatus()` | 1611-1660 | Add status indicators to cards |
| `updateMonitorIndicatorsForProject()` | 680-744 | Update status after test run |
| `showMonitorToast()` | 374-395 | Show notification toasts |

### 📝 Modals & Forms
| Function | Lines | Purpose |
|----------|-------|---------|
| `openEditModal()` | 3388-3534 | Open edit dialog |
| `saveEdit()` | 3537-3634 | Save project changes |
| `openAddModal()` | 3650-3725 | Open add project dialog |
| `saveNewProject()` | 3794-3844 | Create new project |

### ⚙️ Monitor Management
| Function | Lines | Purpose |
|----------|-------|---------|
| `enterMonitorEditMode()` | 2859-2919 | Enter test editing mode |
| `exitMonitorEditMode()` | 2921-2957 | Exit test editing mode |
| `populateMonitorTabs()` | 3104-3134 | Fill form with project data |
| `collectMonitorFromForm()` | 2681-2835 | Extract data from form |

### ⏰ Scheduling
| Function | Lines | Purpose |
|----------|-------|---------|
| `startMonitorScheduler()` | 1121-1127 | Start automatic test runs |
| `stopMonitorScheduler()` | 1129-1134 | Stop automatic test runs |
| `runScheduledMonitorCycle()` | 1095-1119 | Check and run due tests |

## Circular Dependencies

⚠️ **Warning:** The following modules have circular dependencies:

```
api-monitor ←→ ui-manager ←→ modal-handler
```

This means they cannot be easily split without:
1. Dependency injection
2. Event bus pattern
3. Complete restructure

## Future Refactoring Path

### Phase 1: Extract Pure Functions ✅ (Done)
- ✅ Utility functions → `utils.js`
- ✅ Storage operations → `storage.js`
- ✅ Configuration → `config.js`

### Phase 2: Document & Organize ✅ (Done)
- ✅ Add section markers
- ✅ Create function reference
- ✅ Document dependencies

### Phase 3: Break Circular Dependencies (Future)
- [ ] Create event bus for cross-module communication
- [ ] Use dependency injection pattern
- [ ] Separate concerns more clearly

### Phase 4: Full Modularization (Future)
- [ ] Extract API monitor logic
- [ ] Extract UI rendering
- [ ] Extract modal handlers
- [ ] Create proper build process

## How to Navigate script.js

Use these markers to jump to sections:

```javascript
// Search for these comments in the file:

// ===== GLOBAL STATE =====
// ===== MONITOR CONFIGURATION =====
// ===== API & TESTING =====
// ===== SCHEDULING =====
// ===== UI TOOLTIPS =====
// ===== UI TABS =====
// ===== MONITOR EDITOR =====
// ===== MODALS =====
// ===== RENDERING =====
// ===== EVENT HANDLERS =====
// ===== INITIALIZATION =====
```

## Performance Tips

- Script.js is large (150KB) but:
  - ✅ Loads once and caches
  - ✅ No external dependencies
  - ✅ All code is used (minimal dead code)
  - ✅ Modern browsers handle it well

If performance becomes an issue:
1. Implement code splitting
2. Lazy load modal code
3. Use a build tool (webpack/vite)
4. Minify for production

## Maintenance Guidelines

When modifying script.js:

1. **Find the right section** using line numbers above
2. **Check dependencies** before moving code
3. **Test thoroughly** - complex interdependencies
4. **Update this map** when structure changes

## Questions?

See:
- `REFACTORING.md` - Complete refactoring documentation
- `REFACTORING_SUMMARY.md` - Quick reference
- Script.js header - File organization

---

**Last Updated:** 2025-11-10
**Status:** Documented, organized, partially modularized
**Next Step:** Consider event bus pattern for full modularization

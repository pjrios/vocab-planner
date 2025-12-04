# Modularization Quick Reference

## Current Status

- **Main File:** 1624 lines
- **Modules Created:** 2 (Auth, Progress)
- **Total Code:** ~2189 lines (main + modules)

## Remaining Modules to Create

### 1. StudentActivities (~400 lines)
**File:** `js/student/studentActivities.js`

**Key Methods:**
- `loadManifest()`
- `loadVocabulary()`
- `loadCloudVocabularies()`
- `renderDashboard()`
- `showActivityMenu()`
- `startActivity()`
- `handleAutoSave()`
- `handleIllustrationSave()`
- `handleStateSave()`

**Usage:**
```javascript
this.activities.loadVocabulary(vocab);
this.activities.startActivity('matching');
```

---

### 2. StudentGames (~600 lines)
**File:** `js/student/studentGames.js`

**Key Methods:**
- `updateArcadeUI()`
- `updateGameSelectionUI()`
- `saveHighScore()`
- `loadLeaderboard()`
- `startGame()`
- `stopCurrentGame()`
- `loadHTMLGame()`
- `addGameTime()`
- `updateGameTimer()`
- `formatTime()`

**Usage:**
```javascript
this.games.startGame('snake');
this.games.saveHighScore('snake', 1000);
```

---

### 3. StudentUI (~400 lines)
**File:** `js/student/studentUI.js`

**Key Methods:**
- `switchView()`
- `showToast()`
- `initListeners()` (split into smaller methods)
- `addListener()`
- `showNotificationBadge()`
- `showNotificationPanel()`
- `scheduleCloudSync()`

**Usage:**
```javascript
this.ui.switchView('main-menu-view');
this.ui.showToast('Success!');
```

---

## Implementation Order

1. **Activities Module** (2-3 hours)
   - Well-defined boundaries
   - Minimal dependencies
   - Clear responsibilities

2. **Games Module** (3-4 hours)
   - Well-isolated
   - Some dependencies on Activities
   - Complex but manageable

3. **UI Module** (2-3 hours)
   - Coordinates everything
   - Large `initListeners()` to split
   - Do last since it depends on others

---

## Module Pattern

```javascript
// Module structure
export class StudentModule {
    constructor(studentManager) {
        this.sm = studentManager; // Access to StudentManager
    }
    
    method() {
        // Access StudentManager state: this.sm.property
        // Access other modules: this.sm.otherModule.method()
        // Access StudentManager methods: this.sm.method()
    }
}

// In StudentManager
this.module = new StudentModule(this);
```

---

## Expected Final Structure

```
js/student/
├── studentAuth.js       (~200 lines) ✅
├── studentProgress.js   (~400 lines) ✅
├── studentActivities.js (~400 lines) ⏭️
├── studentGames.js      (~600 lines) ⏭️
└── studentUI.js         (~400 lines) ⏭️

js/student.js            (~400-500 lines) ⏭️
```

**Total:** ~2500 lines (organized into 6 files vs 1 large file)

---

## Quick Migration Steps

1. Create module file
2. Copy methods to module
3. Update `this.` to `this.sm.`
4. Initialize in StudentManager constructor
5. Replace method calls
6. Test
7. Remove old implementations

---

## See Full Plan

For detailed implementation guide, see `MODULARIZATION_PLAN.md`


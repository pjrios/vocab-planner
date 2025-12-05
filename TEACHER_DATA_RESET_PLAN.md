# Teacher Data Reset Feature Plan

## Overview
Add a data reset/clear feature to the teacher dashboard that allows teachers to delete student data from Firestore. This is essential for:
- Starting fresh each school year
- Clearing test data
- Privacy/compliance (GDPR, COPPA, FERPA)
- Troubleshooting data issues

## ⚠️ Critical Safety Considerations

### 1. **Destructive Operation**
- This permanently deletes data
- No built-in undo in Firestore
- Must have strong safeguards

### 2. **Security Requirements**
- **Teacher-only access** (enforced by Firestore rules)
- **Confirmation dialogs** (multiple steps)
- **Audit logging** (who deleted what, when)
- **Granular permissions** (what can be deleted)

### 3. **Data Backup Recommendation**
- Export data before deletion (optional but recommended)
- Warn users about data loss
- Provide export option in reset UI

---

## Firestore Collections to Manage

Based on codebase analysis:

1. **`studentProgress`** - Student progress, coins, scores, images
   - Document ID: `{userId}`
   - Contains: units, scores, coinData, coinHistory

2. **`scores`** - Leaderboard scores for games
   - Document ID: `{userId}-{gameId}`
   - Contains: gameId, score, grade, timestamp

3. **`userRoles`** - User role assignments
   - Document ID: `{userId}`
   - Contains: role, email
   - **Note:** Should we allow deleting roles? Probably not - keep for audit trail

4. **`vocabularies`** - Vocabulary sets (teacher-created)
   - Document ID: `{vocabId}`
   - **Note:** Usually teachers manage these separately, but could add reset option

---

## Reset Options

### Option 1: Granular Reset (Recommended)
Allow teachers to choose what to reset:

```
☐ Student Progress (scores, coins, images)
☐ Leaderboard Scores (game high scores)
☐ User Roles (⚠️ Advanced - keep for audit)
☐ All Student Data (everything above)
```

### Option 2: Student-Specific Reset
Reset data for specific students:

- Select students by:
  - Individual selection
  - Grade level
  - Date range (last active)
  - All students

### Option 3: Time-Based Reset
Reset data older than X days/months:

- Useful for end-of-year cleanup
- Keep recent data, delete old data

### Option 4: Collection-Wide Reset
Reset entire collections:

- **⚠️ Most Dangerous**
- Requires strongest confirmation
- Should require admin approval or special flag

---

## UI/UX Design

### Location
Add to Teacher Dashboard:
- **Advanced section** (collapsible, less prominent)
- Add to existing "Student Progress" view as an "Advanced" subsection
- Clearly marked as advanced/destructive operations
- Should be visually separated (different styling, warning colors)

### Reset Interface

```
┌─────────────────────────────────────────────┐
│  🗑️ Data Reset & Management                 │
│  ─────────────────────────────────────────  │
│                                             │
│  ⚠️ WARNING: This action cannot be undone!  │
│                                             │
│  What would you like to reset?              │
│                                             │
│  ☐ Student Progress                         │
│     └─ Scores, coins, images, activity data │
│                                             │
│  ☐ Leaderboard Scores                       │
│     └─ Game high scores                     │
│                                             │
│  ☐ User Roles (Advanced)                    │
│     └─ ⚠️ Not recommended                  │
│                                             │
│  Select students:                           │
│  ○ All students                             │
│  ○ By grade: [Dropdown]                     │
│  ○ Specific students: [Multi-select]        │
│  ○ Inactive for: [30 days]                 │
│                                             │
│  [Export Data First] [Reset Selected Data]  │
└─────────────────────────────────────────────┘
```

### Data Visualization

**Preview Table View:**
```
┌─────────────────────────────────────────────────────────────┐
│  Data Preview                                               │
│  ───────────────────────────────────────────────────────  │
│                                                             │
│  Student Progress (45 records):                             │
│  ┌─────────────┬──────────┬──────────┬──────────────┐    │
│  │ Student     │ Grade    │ Coins    │ Last Active   │    │
│  ├─────────────┼──────────┼──────────┼──────────────┤    │
│  │ Alice Smith │ 5th      │ 250      │ 2024-01-15   │    │
│  │ Bob Jones   │ 5th      │ 180      │ 2024-01-14   │    │
│  │ ...         │ ...      │ ...      │ ...          │    │
│  └─────────────┴──────────┴──────────┴──────────────┘    │
│                                                             │
│  Leaderboard Scores (120 records):                         │
│  ┌─────────────┬──────────────┬──────────┬──────────┐    │
│  │ Student     │ Game         │ Score    │ Date      │    │
│  ├─────────────┼──────────────┼──────────┼──────────┤    │
│  │ Alice Smith │ Level Devil  │ 1250     │ 2024-01-10│    │
│  │ ...         │ ...          │ ...      │ ...       │    │
│  └─────────────┴──────────────┴──────────┴──────────┘    │
│                                                             │
│  [Export All] [Close]                                      │
└─────────────────────────────────────────────────────────────┘
```

**Summary Statistics:**
- Total students: 45
- Total progress records: 45
- Total scores: 120
- Date range: 2023-09-01 to 2024-01-15
- Total coins: 12,450
- Most active game: Level Devil (45 scores)

### Confirmation Flow

**Step 1: Export Required (MANDATORY)**
- User must export data before reset is enabled
- Export button generates JSON/CSV file
- Preview shows what will be deleted
- Reset button is **disabled** until export is completed

**Step 2: Confirmation Dialog**
```
┌─────────────────────────────────────────────┐
│  ⚠️ Confirm Data Reset                      │
│  ─────────────────────────────────────────  │
│                                             │
│  You are about to delete:                   │
│  • 45 student progress records              │
│  • 120 leaderboard scores                   │
│                                             │
│  This action CANNOT be undone!              │
│                                             │
│  Type "DELETE" to confirm:                  │
│  [________________]                         │
│                                             │
│  [Cancel]  [Delete Data]                    │
└─────────────────────────────────────────────┘
```

**Step 3: Final Confirmation**
- Require typing "DELETE" or "RESET"
- Show countdown (optional, e.g., 5 seconds)
- Final "Yes, Delete Everything" button

---

## Implementation Details

### 1. Firestore Rules Update

**Current rules allow teachers to write to `studentProgress` and `scores`, but we need explicit delete permissions:**

```javascript
// Student Progress Collection
match /studentProgress/{userId} {
  allow read: if request.auth != null && (request.auth.uid == userId || isTeacher());
  allow write: if request.auth != null && (request.auth.uid == userId || isTeacher());
  allow delete: if isTeacher(); // Explicit delete permission
}

// Leaderboard Scores
match /scores/{scoreId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
  allow update: if request.auth != null && request.resource.data.userId == request.auth.uid;
  allow delete: if isTeacher(); // Allow teachers to delete scores
}
```

### 2. Data Export Implementation

**Export Student Progress:**
```javascript
async exportStudentProgress(studentIds, format = 'json') {
    const db = firebaseAuthService.getFirestore();
    const progressData = [];
    
    for (const studentId of studentIds) {
        const docRef = doc(db, 'studentProgress', studentId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            progressData.push({
                studentId: studentId,
                ...docSnap.data()
            });
        }
    }
    
    if (format === 'json') {
        return this.downloadJSON(progressData, 'student-progress-export.json');
    } else if (format === 'csv') {
        return this.downloadCSV(progressData, 'student-progress-export.csv');
    }
}

downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

downloadCSV(data, filename) {
    // Convert to CSV format
    const headers = ['Student ID', 'Name', 'Grade', 'Coins', 'Total Earned', 'Last Active'];
    const rows = data.map(item => [
        item.studentId,
        item.name || '',
        item.grade || '',
        item.coinData?.balance || 0,
        item.coinData?.totalEarned || 0,
        item.lastActive || ''
    ]);
    
    const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
```

**Export Leaderboard Scores:**
```javascript
async exportScores(studentIds, format = 'json') {
    const db = firebaseAuthService.getFirestore();
    const scoresRef = collection(db, 'scores');
    
    // Get all scores for selected students
    const allScores = [];
    const queryPromises = studentIds.map(studentId => {
        return getDocs(query(scoresRef, where('userId', '==', studentId)));
    });
    
    const querySnapshots = await Promise.all(queryPromises);
    querySnapshots.forEach(snapshot => {
        snapshot.forEach(doc => {
            allScores.push({
                scoreId: doc.id,
                ...doc.data()
            });
        });
    });
    
    if (format === 'json') {
        return this.downloadJSON(allScores, 'scores-export.json');
    } else if (format === 'csv') {
        return this.downloadCSV(allScores, 'scores-export.csv');
    }
}
```

**Data Preview/Visualization:**
```javascript
async previewData(studentIds, dataTypes) {
    const preview = {
        studentProgress: [],
        scores: [],
        userRoles: [],
        summary: {
            totalStudents: studentIds.length,
            totalProgressRecords: 0,
            totalScores: 0,
            dateRange: { start: null, end: null },
            totalCoins: 0,
            gamesPlayed: new Set()
        }
    };
    
    if (dataTypes.includes('studentProgress')) {
        // Fetch progress data
        const progressData = await this.fetchProgressData(studentIds);
        preview.studentProgress = progressData;
        preview.summary.totalProgressRecords = progressData.length;
        
        // Calculate statistics
        progressData.forEach(item => {
            preview.summary.totalCoins += (item.coinData?.balance || 0);
            if (item.lastActive) {
                const date = new Date(item.lastActive);
                if (!preview.summary.dateRange.start || date < preview.summary.dateRange.start) {
                    preview.summary.dateRange.start = date;
                }
                if (!preview.summary.dateRange.end || date > preview.summary.dateRange.end) {
                    preview.summary.dateRange.end = date;
                }
            }
        });
    }
    
    if (dataTypes.includes('scores')) {
        // Fetch score data
        const scoreData = await this.fetchScoreData(studentIds);
        preview.scores = scoreData;
        preview.summary.totalScores = scoreData.length;
        
        // Track games
        scoreData.forEach(item => {
            if (item.gameId) {
                preview.summary.gamesPlayed.add(item.gameId);
            }
        });
    }
    
    return preview;
}
```

### 3. Batch Delete Implementation

**For large datasets, use Firestore batch operations:**

```javascript
async resetStudentProgress(studentIds) {
    const db = firebaseAuthService.getFirestore();
    const batchSize = 500; // Firestore batch limit
    
    for (let i = 0; i < studentIds.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = studentIds.slice(i, i + batchSize);
        
        chunk.forEach(studentId => {
            const docRef = doc(db, 'studentProgress', studentId);
            batch.delete(docRef);
        });
        
        await batch.commit();
        
        // Show progress
        this.updateProgress((i + chunk.length) / studentIds.length);
    }
}
```

### 4. Export Status Tracking

**Track export completion:**
```javascript
async markExportComplete(dataTypes, studentIds, exportFormat) {
    // Store export metadata in localStorage or Firestore
    const exportRecord = {
        timestamp: new Date().toISOString(),
        teacherId: this.currentUser.uid,
        dataTypes: dataTypes,
        studentCount: studentIds.length,
        format: exportFormat,
        filename: `export-${Date.now()}.${exportFormat}`
    };
    
    // Store in localStorage for this session
    localStorage.setItem('lastExport', JSON.stringify(exportRecord));
    
    // Also store in Firestore for audit (optional)
    const db = firebaseAuthService.getFirestore();
    await addDoc(collection(db, 'exportLogs'), {
        ...exportRecord,
        timestamp: serverTimestamp()
    });
    
    // Enable reset button
    this.enableResetButton();
}

isExportComplete() {
    const lastExport = localStorage.getItem('lastExport');
    if (!lastExport) return false;
    
    const exportData = JSON.parse(lastExport);
    // Check if export is recent (within last hour)
    const exportTime = new Date(exportData.timestamp);
    const now = new Date();
    const hoursSinceExport = (now - exportTime) / (1000 * 60 * 60);
    
    return hoursSinceExport < 1; // Export valid for 1 hour
}
```

### 5. Query-Based Deletion

**For grade-based or date-based resets:**

```javascript
async resetByGrade(grade) {
    const db = firebaseAuthService.getFirestore();
    const progressRef = collection(db, 'studentProgress');
    
    // Get all student progress
    const snapshot = await getDocs(progressRef);
    const toDelete = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        // Check if student has this grade in their profile
        // Note: Grade might be in userRoles or studentProgress
        if (data.grade === grade) {
            toDelete.push(doc.id);
        }
    });
    
    // Batch delete
    await this.batchDelete('studentProgress', toDelete);
}
```

### 4. Export Status Tracking

**Track export completion:**
```javascript
async markExportComplete(dataTypes, studentIds, exportFormat) {
    // Store export metadata in localStorage or Firestore
    const exportRecord = {
        timestamp: new Date().toISOString(),
        teacherId: this.currentUser.uid,
        dataTypes: dataTypes,
        studentCount: studentIds.length,
        format: exportFormat,
        filename: `export-${Date.now()}.${exportFormat}`
    };
    
    // Store in localStorage for this session
    localStorage.setItem('lastExport', JSON.stringify(exportRecord));
    
    // Also store in Firestore for audit (optional)
    const db = firebaseAuthService.getFirestore();
    await addDoc(collection(db, 'exportLogs'), {
        ...exportRecord,
        timestamp: serverTimestamp()
    });
    
    // Enable reset button
    this.enableResetButton();
}

isExportComplete() {
    const lastExport = localStorage.getItem('lastExport');
    if (!lastExport) return false;
    
    const exportData = JSON.parse(lastExport);
    // Check if export is recent (within last hour)
    const exportTime = new Date(exportData.timestamp);
    const now = new Date();
    const hoursSinceExport = (now - exportTime) / (1000 * 60 * 60);
    
    return hoursSinceExport < 1; // Export valid for 1 hour
}
```

### 5. Audit Logging

**Create a new collection for audit logs:**

```javascript
// New collection: adminLogs
async logResetAction(action, details) {
    const db = firebaseAuthService.getFirestore();
    await addDoc(collection(db, 'adminLogs'), {
        action: 'data_reset',
        teacherId: this.currentUser.uid,
        teacherEmail: this.currentUser.email,
        timestamp: serverTimestamp(),
        details: {
            collections: ['studentProgress', 'scores'],
            studentCount: 45,
            scoreCount: 120,
            filters: { grade: '5th' }
        }
    });
}
```

### 6. Progress Indicator

**For large deletions, show progress:**

```javascript
showResetProgress(current, total, collection) {
    const percent = Math.round((current / total) * 100);
    notifications.info(`Deleting ${collection}: ${current}/${total} (${percent}%)`);
    
    // Update UI
    $('#reset-progress').style.width = `${percent}%`;
    $('#reset-status').textContent = `Deleting ${collection}... ${current}/${total}`;
}
```

---

## Safety Features

### 1. **Export Requirement**
- **MANDATORY:** Export must be completed before reset is enabled
- Reset button is disabled until export is done
- Track export status (when exported, what was exported)
- Show export status in reset UI

### 2. **Data Visualization**
- **Preview Table:** Show detailed preview of data to be deleted
- **Summary Statistics:** Show counts, date ranges, totals
- **Interactive Preview:** Expandable rows, sortable columns
- **Export Formats:** JSON (full data) and CSV (spreadsheet-friendly)
- **Visual Charts:** Optional charts showing data distribution

### 3. **Export Functionality**
- **JSON Export:** Full data structure (for backup/restore)
- **CSV Export:** Spreadsheet-friendly format (for analysis)
- **Preview Export:** Show what will be exported before downloading
- **Batch Export:** Export all selected data in one file
- **Export Tracking:** Remember what was exported and when

### 4. **Confirmation Requirements**
- Type confirmation text
- Multiple confirmation dialogs
- Optional: Require second teacher approval

### 5. **Error Handling**
- Handle partial failures gracefully
- Continue deletion if some documents fail
- Report which deletions succeeded/failed

---

## Use Cases

### Use Case 1: End of School Year
**Scenario:** Teacher wants to clear all data for new school year

**Steps:**
1. Export all student data (optional backup)
2. Select "All students"
3. Select "Student Progress" and "Leaderboard Scores"
4. Confirm deletion
5. Data cleared, ready for new year

### Use Case 2: Clear Test Data
**Scenario:** Teacher created test accounts and wants to clean up

**Steps:**
1. Select specific test students
2. Select all data types
3. Confirm deletion
4. Test data removed

### Use Case 3: Privacy Compliance
**Scenario:** Student left school, need to delete their data

**Steps:**
1. Search for specific student
2. Select that student only
3. Select all data types
4. Confirm deletion
5. Student data removed per privacy policy

### Use Case 4: Grade-Level Reset
**Scenario:** Moving 5th graders to 6th grade, reset their data

**Steps:**
1. Select "By grade: 5th"
2. Select "Student Progress" and "Leaderboard Scores"
3. Confirm deletion
4. Grade-level data cleared

---

## Implementation Phases

### Phase 1: Export & Visualization (MVP)
- [ ] Add "Advanced" section to teacher dashboard (collapsible)
- [ ] Implement data export functionality (JSON and CSV)
- [ ] Create data preview/visualization UI
- [ ] Show summary statistics
- [ ] Implement student selection (all, by grade, specific)
- [ ] Implement data type selection (progress, scores, etc.)
- [ ] Export tracking (remember what was exported)

### Phase 2: Reset with Export Requirement
- [ ] Implement reset for `studentProgress` collection
- [ ] Implement reset for `scores` collection
- [ ] Require export before enabling reset button
- [ ] Show export status in reset UI
- [ ] Basic confirmation dialog
- [ ] Batch delete with progress indicator
- [ ] Update Firestore rules for delete permissions

### Phase 3: Enhanced Visualization
- [ ] Interactive preview tables
- [ ] Sortable/filterable preview columns
- [ ] Visual charts (optional - bar charts, pie charts)
- [ ] Date range visualization
- [ ] Export format options (JSON, CSV, Excel)

### Phase 4: Advanced Features
- [ ] Audit logging
- [ ] Time-based filtering (inactive students)
- [ ] Enhanced error recovery
- [ ] Export history tracking
- [ ] Restore from export (optional - advanced feature)

### Phase 5: Polish & Safety
- [ ] Enhanced confirmation flow
- [ ] Better progress indicators
- [ ] Comprehensive error handling
- [ ] Documentation and warnings
- [ ] Testing with large datasets
- [ ] Performance optimization for large exports

---

## Open Questions

1. **Should we allow deleting `userRoles`?**
   - **Recommendation:** No, keep for audit trail
   - Or add special "admin" flag requirement

2. **Should we allow deleting `vocabularies`?**
   - **Recommendation:** Yes, but separate from student data reset
   - Teachers already have delete in vocabulary editor

3. **Should there be a "soft delete" option?**
   - Mark as deleted but don't actually delete
   - **Recommendation:** No, adds complexity, Firestore doesn't have built-in soft delete

4. **Should we require export before delete?**
   - **✅ DECISION: YES - MANDATORY**
   - Export must be completed before reset button is enabled
   - Track export status and show in UI
   - Provide both JSON and CSV export formats
   - Include data visualization/preview before export

5. **Should there be a cooldown period?**
   - **✅ DECISION: NO cooldown required**
   - Multiple confirmations and export requirement provide sufficient safety
   - Teachers may need to reset multiple times (e.g., different grades)

6. **Should we support partial rollback?**
   - **Recommendation:** No, too complex
   - Focus on prevention (confirmations) rather than recovery

---

## Testing Checklist

### Export & Visualization
- [ ] Export student progress as JSON
- [ ] Export student progress as CSV
- [ ] Export scores as JSON
- [ ] Export scores as CSV
- [ ] Export all data types together
- [ ] Preview shows correct data
- [ ] Preview statistics are accurate
- [ ] Preview tables are sortable/filterable
- [ ] Export works for single student
- [ ] Export works for multiple students
- [ ] Export works for grade level
- [ ] Export works for all students
- [ ] Large dataset export (100+ students) works
- [ ] Export files download correctly
- [ ] Export status is tracked
- [ ] Export status persists across page reloads

### Reset Functionality
- [ ] Reset button is disabled until export is complete
- [ ] Reset button enables after export
- [ ] Reset single student data
- [ ] Reset multiple students
- [ ] Reset by grade level
- [ ] Reset all students
- [ ] Reset only progress (not scores)
- [ ] Reset only scores (not progress)
- [ ] Reset both progress and scores
- [ ] Confirmation dialogs work correctly
- [ ] Typing "DELETE" requirement works
- [ ] Progress indicator shows correctly
- [ ] Handles errors gracefully (network issues, permissions)
- [ ] Firestore rules prevent non-teachers from deleting
- [ ] Audit logs are created correctly
- [ ] Large dataset deletion (100+ students) works
- [ ] UI is responsive during deletion
- [ ] No memory leaks during batch operations
- [ ] Can reset multiple times (no cooldown)

---

## Security Considerations

1. **Firestore Rules:**
   - Only teachers can delete
   - Verify teacher role before allowing delete
   - Consider adding admin-only flag for collection-wide deletes

2. **Client-Side Validation:**
   - Verify user is teacher before showing UI
   - Double-check permissions before deletion
   - Don't trust client-side only

3. **Rate Limiting:**
   - Prevent abuse
   - Limit frequency of resets
   - Consider Cloud Functions for server-side validation

4. **Audit Trail:**
   - Log all deletions
   - Include who, what, when
   - Store in separate collection (not deletable by teachers)

---

## UI Implementation Details

### Advanced Section in Teacher Dashboard

**Location:** Add to `teacher.html` in the Student Progress view:

```html
<!-- In teacher-progress-view section -->
<div class="card" style="margin-top: 2rem; border: 2px solid var(--danger-color);">
    <details>
        <summary style="cursor: pointer; padding: 1rem; font-weight: 600; color: var(--danger-color);">
            ⚠️ Advanced: Data Export & Reset
        </summary>
        <div style="padding: 1.5rem;">
            <!-- Export & Visualization Section -->
            <div id="data-export-section">
                <!-- Export UI here -->
            </div>
            
            <!-- Reset Section (disabled until export) -->
            <div id="data-reset-section" style="margin-top: 2rem; opacity: 0.5;">
                <!-- Reset UI here -->
            </div>
        </div>
    </details>
</div>
```

### Export UI Components

1. **Data Selection Panel**
   - Checkboxes for data types
   - Student selection dropdowns
   - "Preview Data" button

2. **Preview Panel**
   - Summary statistics cards
   - Data tables (expandable)
   - "Export JSON" and "Export CSV" buttons

3. **Export Status Indicator**
   - Shows when export was completed
   - Shows what was exported
   - Green checkmark when complete

### Reset UI Components

1. **Reset Selection Panel**
   - Same checkboxes as export (pre-filled from export)
   - Disabled until export is complete
   - Shows export status

2. **Confirmation Dialog**
   - Shows what will be deleted
   - Requires typing "DELETE"
   - Progress indicator during deletion

## Next Steps

1. **Review and approve this improved plan**
2. **Update Firestore rules** (add delete permissions)
3. **Implement Phase 1** (export & visualization functionality)
4. **Implement Phase 2** (reset with export requirement)
5. **Test thoroughly** with test data
6. **Add to teacher dashboard** UI in Advanced section
7. **Document for teachers** (how to use, warnings)

---

## Alternative: Cloud Functions Approach

**For extra security, consider using Cloud Functions:**

```javascript
// Cloud Function: resetStudentData
exports.resetStudentData = functions.https.onCall(async (data, context) => {
    // Verify teacher
    if (!context.auth || !isTeacher(context.auth.uid)) {
        throw new functions.https.HttpsError('permission-denied', 'Only teachers can reset data');
    }
    
    // Perform deletion server-side
    // More secure, can add additional checks
    // Can implement rate limiting
    // Can add more complex logic
});
```

**Pros:**
- More secure (server-side validation)
- Can add complex business logic
- Better rate limiting
- Can add additional safety checks

**Cons:**
- Requires Cloud Functions setup
- More complex deployment
- Additional cost (though minimal)

**Recommendation:** Start with client-side, move to Cloud Functions if needed for security/compliance.


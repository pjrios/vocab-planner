# Data Viewer / JSON Loader Plan

## Overview
Add a section in the Advanced area where teachers can load exported JSON files and view all the progress data in a readable, organized format. This allows teachers to:
- Review exported data before resetting
- Analyze progress data offline
- Verify what was exported
- View historical exports
- Compare different exports

---

## UI Design

### Location
Add to the "Advanced: Data Export & Reset" section, as a new tab or section alongside Export/Reset.

### Layout Options

#### Option 1: Tabs (Recommended)
```
┌─────────────────────────────────────────────┐
│  Advanced: Data Export & Reset              │
│  ─────────────────────────────────────────  │
│  [Export] [View Data] [Reset]               │
│                                             │
│  ── View Data Tab ──                        │
│  Load JSON file to view progress data      │
│  [📁 Choose File] [Load]                    │
│                                             │
│  [Data Summary]                             │
│  [Data Tables]                               │
└─────────────────────────────────────────────┘
```

#### Option 2: Separate Section
Add a new collapsible section below Export, above Reset.

---

## Features

### 1. File Loading
- **File Input**: Standard file picker for JSON files
- **Drag & Drop**: Optional - drag JSON file onto drop zone
- **Validation**: Verify file is valid JSON and matches expected format
- **Error Handling**: Clear error messages for invalid files

### 2. Data Summary
Show overview statistics:
- Total students
- Total vocabulary units
- Total activity scores
- Total game scores
- Date range
- Total coins
- Export date (if available in metadata)

### 3. Data Visualization

#### Student List View
- Table showing all students
- Columns: Name, Grade, Coins, Vocab Units, Last Active
- Sortable columns
- Search/filter functionality
- Click to expand student details

#### Student Detail View
When clicking a student:
- **Profile Info**: Name, grade, email, student ID
- **Coins**: Balance, total earned, total spent, history
- **Vocabulary Progress**: 
  - List of all vocabularies
  - For each vocabulary:
    - Activity scores (matching, flashcards, quiz, etc.)
    - Progress percentages
    - Last activity date
    - Images count (if any)
- **Game Scores**: Leaderboard scores for each game
- **Timeline**: Activity timeline (optional)

#### Vocabulary Progress View
- Group by vocabulary set
- Show all students' progress for that vocabulary
- Activity breakdown (which activities completed)
- Average scores
- Completion rates

#### Activity Scores View
- Group by activity type (matching, flashcards, quiz, etc.)
- Show all scores across all vocabularies
- Statistics (average, min, max)
- Distribution charts (optional)

### 4. Data Comparison (Optional - Future)
- Load two JSON files
- Compare differences
- Show what changed between exports
- Highlight new/removed students
- Show progress changes

---

## Implementation Details

### File Structure Expected
```json
{
  "studentProgress": [
    {
      "studentId": "user123",
      "studentProfile": { ... },
      "units": {
        "Vocabulary Set 1": {
          "scores": {
            "matching": { "score": 85, ... },
            "flashcards": { "score": 90, ... }
          },
          "images": { ... },
          "states": { ... }
        }
      },
      "coinData": { ... },
      "coinHistory": [ ... ]
    }
  ],
  "scores": [ ... ],
  "userRoles": [ ... ]
}
```

### Component Structure

```javascript
class DataViewer {
    constructor() {
        this.loadedData = null;
        this.currentView = 'summary'; // 'summary' | 'students' | 'vocab' | 'activities'
        this.selectedStudent = null;
    }
    
    loadJSONFile(file) {
        // Read and parse JSON
        // Validate structure
        // Store in this.loadedData
        // Render summary
    }
    
    renderSummary() {
        // Calculate statistics
        // Display summary cards
    }
    
    renderStudentList() {
        // Table of all students
        // Click handler to show details
    }
    
    renderStudentDetails(studentId) {
        // Full student progress view
        // Vocabulary breakdown
        // Activity scores
        // Coin history
    }
    
    renderVocabularyView() {
        // Group by vocabulary
        // Show all students' progress
    }
    
    renderActivityView() {
        // Group by activity type
        // Show all scores
    }
}
```

---

## UI Components

### 1. File Loader Section
```html
<div id="data-viewer-section">
    <h3>📂 View Exported Data</h3>
    <p>Load a previously exported JSON file to view all progress data.</p>
    
    <div style="border: 2px dashed var(--border-color); border-radius: 8px; padding: 2rem; text-align: center;">
        <input type="file" id="load-json-file" accept=".json" style="display: none;">
        <button id="choose-file-btn" class="btn primary-btn">📁 Choose JSON File</button>
        <p style="margin-top: 1rem; color: var(--text-muted);">or drag and drop file here</p>
    </div>
    
    <div id="file-info" style="display: none; margin-top: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span>✅</span>
            <span id="file-name"></span>
            <span id="file-size" style="color: var(--text-muted);"></span>
        </div>
    </div>
</div>
```

### 2. View Tabs
```html
<div id="view-tabs" style="display: none; margin-top: 2rem;">
    <div style="display: flex; gap: 0.5rem; border-bottom: 2px solid var(--border-color);">
        <button class="view-tab active" data-view="summary">Summary</button>
        <button class="view-tab" data-view="students">Students</button>
        <button class="view-tab" data-view="vocab">By Vocabulary</button>
        <button class="view-tab" data-view="activities">By Activity</button>
    </div>
    
    <div id="view-content">
        <!-- Content will be rendered here -->
    </div>
</div>
```

### 3. Summary View
- Statistics cards (same as preview)
- Quick overview
- Export metadata if available

### 4. Students View
- Searchable/sortable table
- Expandable rows for details
- Filter by grade, vocabulary, etc.

### 5. Vocabulary View
- Accordion/collapsible sections per vocabulary
- Student progress within each vocabulary
- Activity breakdown

### 6. Activities View
- Grouped by activity type
- All scores across all vocabularies
- Statistics and charts

---

## Data Display Format

### Student Detail Modal/Section
```
┌─────────────────────────────────────────────┐
│  Student: Alice Smith (Grade 5)             │
│  ─────────────────────────────────────────  │
│                                             │
│  Profile:                                   │
│  • Email: alice@example.com                 │
│  • Student ID: user123                      │
│  • Coins: 250                               │
│                                             │
│  Vocabulary Progress:                        │
│  ┌─────────────────────────────────────┐   │
│  │ Unit 1: Animals                      │   │
│  │ • Matching: 85%                      │   │
│  │ • Flashcards: 90%                    │   │
│  │ • Quiz: 80%                          │   │
│  │ • Images: 5                          │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ Unit 2: Food                         │   │
│  │ • Matching: 75%                      │   │
│  │ • ...                                │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Game Scores:                               │
│  • Level Devil: 1,250                       │
│  • SpacePi: 45 (Level 3)                     │
│                                             │
│  [Close]                                    │
└─────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Basic File Loading & Summary
- [ ] Add "View Data" section to Advanced area
- [ ] File input for JSON loading
- [ ] JSON parsing and validation
- [ ] Summary statistics display
- [ ] Error handling

### Phase 2: Student List View
- [ ] Student table with basic info
- [ ] Search/filter functionality
- [ ] Sortable columns
- [ ] Click to view details

### Phase 3: Student Detail View
- [ ] Student profile display
- [ ] Vocabulary progress breakdown
- [ ] Activity scores display
- [ ] Coin history
- [ ] Game scores

### Phase 4: Advanced Views
- [ ] Vocabulary-grouped view
- [ ] Activity-grouped view
- [ ] Statistics and charts
- [ ] Export current view (optional)

### Phase 5: Enhancements
- [ ] Drag & drop file loading
- [ ] Data comparison (two files)
- [ ] Export filtered view
- [ ] Print view

---

## Technical Details

### File Validation
```javascript
validateJSONStructure(data) {
    // Check for required fields
    if (!data.studentProgress && !data.scores) {
        throw new Error('Invalid export format: missing studentProgress or scores');
    }
    
    // Validate structure
    if (data.studentProgress && !Array.isArray(data.studentProgress)) {
        throw new Error('Invalid format: studentProgress must be an array');
    }
    
    // Check for expected fields in student progress
    // Return validation result
}
```

### Data Processing
```javascript
processLoadedData(data) {
    return {
        students: data.studentProgress || [],
        scores: data.scores || [],
        roles: data.userRoles || [],
        metadata: data.metadata || {},
        summary: this.calculateSummary(data)
    };
}

calculateSummary(data) {
    // Calculate all statistics
    // Return summary object
}
```

### State Management
- Store loaded data in component state
- Track current view mode
- Track selected student
- Track filters/search terms

---

## User Flow

1. **Load File**
   - User clicks "Choose JSON File"
   - Selects exported JSON file
   - File is validated
   - Data is parsed and stored

2. **View Summary**
   - Summary statistics are displayed
   - User can see overview

3. **Explore Data**
   - Switch between views (Students, Vocabulary, Activities)
   - Search/filter as needed
   - Click student to see details

4. **Analyze**
   - Review vocabulary progress
   - Check activity completion
   - View coin history
   - Review game scores

---

## Error Handling

### Invalid File
- Show clear error message
- Explain what's wrong
- Suggest correct format

### Missing Data
- Handle missing fields gracefully
- Show "N/A" or "Not available"
- Don't crash on incomplete data

### Large Files
- Show loading indicator
- Process in chunks if needed
- Optimize rendering for large datasets

---

## Future Enhancements

1. **Data Comparison**
   - Load two files
   - Compare differences
   - Highlight changes

2. **Charts & Visualizations**
   - Progress charts
   - Activity completion graphs
   - Coin history timeline

3. **Export Filtered View**
   - Filter data
   - Export filtered subset
   - Generate reports

4. **Search & Filter**
   - Advanced search
   - Multiple filters
   - Save filter presets

5. **Print/PDF Export**
   - Print current view
   - Export to PDF
   - Customizable layouts

---

## Testing Checklist

- [ ] Load valid JSON file
- [ ] Load invalid JSON file (error handling)
- [ ] Load file with missing fields (graceful handling)
- [ ] View summary statistics
- [ ] Switch between view tabs
- [ ] Search students
- [ ] Filter by grade
- [ ] Sort table columns
- [ ] View student details
- [ ] Expand vocabulary sections
- [ ] View activity scores
- [ ] Handle large files (100+ students)
- [ ] Drag & drop file (if implemented)
- [ ] Mobile responsive

---

## Open Questions

1. **Should we allow editing loaded data?**
   - Recommendation: No, view-only for safety

2. **Should we save loaded data to localStorage?**
   - Recommendation: Optional, for convenience

3. **Should we support CSV files too?**
   - Recommendation: Start with JSON, add CSV later if needed

4. **Should we show images in the viewer?**
   - Recommendation: Yes, if images are in the export

5. **Should we allow exporting the current view?**
   - Recommendation: Yes, as a convenience feature

---

## Next Steps

1. Review and approve this plan
2. Implement Phase 1 (basic file loading & summary)
3. Test with sample export files
4. Iterate based on feedback
5. Add Phase 2 features (student list view)
6. Continue with remaining phases


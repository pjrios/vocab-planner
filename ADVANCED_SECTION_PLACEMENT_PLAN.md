# Advanced Section Placement Plan

## Current Issue
The "Advanced: Data Export & Reset" section is at the bottom of the Student Progress view, making it hard to find and taking up too much space.

## Options for Placement

### Option 1: Header Button (Recommended)
Add a button in the Student Progress header that opens a modal with the Advanced section.

**Pros:**
- Always accessible
- Doesn't clutter the main view
- Modal keeps it separate and focused
- Easy to find

**Cons:**
- Requires modal implementation
- One more click to access

### Option 2: Dashboard Main Menu
Add "Data Management" button to the main dashboard alongside "Student Progress".

**Pros:**
- Separate view, less clutter
- Easy to find
- Can be accessed from anywhere

**Cons:**
- Another view to navigate to
- Might be less discoverable

### Option 3: Sidebar/Floating Button
Add a floating button or sidebar that's always visible.

**Pros:**
- Always accessible
- Doesn't take up main space

**Cons:**
- Might clutter the UI
- Mobile responsiveness concerns

### Option 4: Settings/Tools Menu
Add to header as a dropdown menu or settings icon.

**Pros:**
- Standard UI pattern
- Clean header integration

**Cons:**
- Might be hidden
- Less discoverable

## Recommendation: Option 1 - Header Button + Modal

Add a button in the Student Progress header that says "⚙️ Data Management" or "📊 Export & Reset" that opens a modal with the Advanced section content.

This keeps it:
- Accessible but not intrusive
- Separate from main content
- Easy to find
- Focused experience

## Implementation
1. Add button to Student Progress header
2. Create modal structure
3. Move Advanced section content to modal
4. Add open/close handlers
5. Make student list scrollable with max-height


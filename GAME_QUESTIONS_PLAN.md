# Game Vocabulary Questions Integration Plan

## Overview
Add vocabulary questions that pause games at regular intervals, requiring students to answer before continuing. This integrates vocabulary learning directly into the gaming experience.

## Goals
1. Pause games periodically to ask vocabulary questions
2. Use vocabulary from the currently selected vocabulary set
3. Support multiple question types (quiz, fill-in-blank, matching, etc.)
4. Reward correct answers and optionally penalize incorrect ones
5. Resume game seamlessly after answering
6. Make it configurable (frequency, question types, difficulty)

---

## Architecture

### 1. Question Manager Module
**New File:** `js/student/gameQuestions.js`

**Responsibilities:**
- Track question intervals (time-based, score-based, or level-based)
- Generate questions from current vocabulary
- Display question UI overlay/modal
- Handle answer submission and feedback
- Manage game pause/resume state
- Track question statistics

**Key Methods:**
```javascript
class GameQuestions {
    constructor(studentManager, gameId)
    startQuestionTimer() // Start interval-based questions
    pauseGameForQuestion() // Pause game and show question
    showQuestionModal(question) // Display question UI
    handleAnswer(answer) // Process answer and provide feedback
    resumeGame() // Resume game after question
    stopQuestionTimer() // Clean up on game end
}
```

### 2. Question Types to Support

#### Phase 1 (Simple):
- **Multiple Choice Quiz** - Use existing `QuizActivity` logic
- **Fill-in-the-Blank** - Use existing `FillInBlankActivity` logic

#### Phase 2 (Advanced):
- **Matching** - Quick 2-3 word matching
- **Flashcards** - Show word, ask for definition (or vice versa)
- **True/False** - Simple true/false questions

### 3. Game Pause/Resume Mechanism

#### For HTML Games (iframe-based):
- **Pause Method:**
  - Send `postMessage` to iframe: `{ type: 'pause-game' }`
  - Games that support it will pause (may need game-specific handling)
  - Overlay question modal on top of iframe
  - Disable iframe interaction (pointer-events: none)

- **Resume Method:**
  - Send `postMessage` to iframe: `{ type: 'resume-game' }`
  - Remove overlay
  - Re-enable iframe interaction

#### For Canvas Games (Level Devil, etc.):
- **Pause Method:**
  - Stop game loop/animation
  - Show question overlay
  - Disable canvas interaction

- **Resume Method:**
  - Restart game loop/animation
  - Remove overlay

### 4. Question Trigger System

#### Options:
1. **Time-based** (Recommended for start):
   - Ask question every X seconds (e.g., every 30-60 seconds)
   - Configurable per vocabulary set

2. **Score-based**:
   - Ask question every X points (e.g., every 100 points)
   - More engaging for score-focused games

3. **Level-based**:
   - Ask question between levels
   - Natural pause point

4. **Hybrid**:
   - Combine time and score thresholds
   - Ask whichever comes first

### 5. UI/UX Design

#### Question Modal Overlay:
```
┌─────────────────────────────────────┐
│  📚 Vocabulary Question              │
│  ─────────────────────────────────  │
│                                     │
│  What is the definition of "word"?  │
│                                     │
│  ○ Option 1                         │
│  ○ Option 2                         │
│  ○ Option 3                         │
│  ○ Option 4                         │
│                                     │
│  [Submit Answer]                    │
│                                     │
│  ⏱️ Game paused                     │
└─────────────────────────────────────┘
```

**Features:**
- Non-dismissible (must answer to continue)
- Clear visual indication game is paused
- Timer showing time spent on question (optional)
- Hint button (optional, costs coins or time)
- Progress indicator (Question 2 of 5)

### 6. Reward/Penalty System

#### Correct Answer:
- **Option A:** Continue playing (no penalty)
- **Option B:** Bonus coins (e.g., +5 coins)
- **Option C:** Bonus time (e.g., +10 seconds)
- **Option D:** Score multiplier (e.g., 1.5x for next 30 seconds)

#### Incorrect Answer:
- **Option A:** Continue playing (no penalty)
- **Option B:** Lose coins (e.g., -2 coins)
- **Option C:** Lose time (e.g., -5 seconds)
- **Option D:** Score penalty (e.g., 0.5x for next 30 seconds)
- **Option E:** Must answer correctly to continue (retry)

### 7. Configuration

Add to vocabulary `activitySettings`:
```json
{
  "gameQuestions": {
    "enabled": true,
    "frequency": "time", // "time" | "score" | "level" | "hybrid"
    "interval": 45, // seconds or points
    "questionTypes": ["quiz", "fillInBlank"], // array of question types
    "questionsPerGame": 5, // max questions per game session
    "rewards": {
      "correct": "coins", // "coins" | "time" | "multiplier" | "none"
      "correctAmount": 5,
      "incorrect": "time", // "coins" | "time" | "penalty" | "retry" | "none"
      "incorrectAmount": -5
    },
    "allowHints": true,
    "hintCost": 2 // coins
  }
}
```

---

## Implementation Phases

### Phase 1: Basic Infrastructure
1. Create `GameQuestions` module
2. Add question timer system
3. Create question modal UI
4. Implement pause/resume for one game type (e.g., HTML games)
5. Support multiple choice questions only
6. Basic reward system (coins)

### Phase 2: Multiple Question Types
1. Add fill-in-the-blank questions
2. Add matching questions (simplified)
3. Add flashcard questions
4. Question type randomization

### Phase 3: Advanced Features
1. Score-based and level-based triggers
2. Advanced reward/penalty system
3. Hint system
4. Question statistics tracking
5. Configuration UI for teachers

### Phase 4: Polish & Optimization
1. Smooth animations
2. Sound effects (optional)
3. Accessibility improvements
4. Performance optimization
5. Comprehensive testing

---

## Technical Details

### Game Pause/Resume Implementation

#### HTML Games (iframe):
```javascript
// Pause
iframe.contentWindow.postMessage({ type: 'pause-game' }, '*');
iframe.style.pointerEvents = 'none';
showQuestionOverlay();

// Resume
iframe.contentWindow.postMessage({ type: 'resume-game' }, '*');
iframe.style.pointerEvents = 'auto';
hideQuestionOverlay();
```

**Note:** Not all games will support pause/resume messages. For games that don't:
- Simply overlay the question modal
- Game continues in background (may need to pause timer)
- User must answer to continue

#### Canvas Games:
```javascript
// Pause
if (this.sm.currentGame && this.sm.currentGame.pause) {
    this.sm.currentGame.pause();
}
showQuestionOverlay();

// Resume
if (this.sm.currentGame && this.sm.currentGame.resume) {
    this.sm.currentGame.resume();
}
hideQuestionOverlay();
```

### Question Generation

Reuse existing activity classes:
```javascript
// For Quiz questions
const quiz = new QuizActivity(container, words, onProgress);
const questions = quiz.generateQuestions();
const randomQuestion = questions[Math.floor(Math.random() * questions.length)];

// For Fill-in-the-Blank
const fib = new FillInBlankActivity(container, words, onProgress);
// Use current word from fib
```

### Integration Points

1. **In `studentGames.js`:**
   - Initialize `GameQuestions` when game starts
   - Pass game type, vocabulary, and settings
   - Clean up when game ends

2. **In `studentActivities.js`:**
   - Ensure vocabulary is loaded before starting game
   - Pass vocabulary words to game questions

3. **In `student.js`:**
   - Add configuration UI for game questions (if needed)
   - Handle question statistics in progress tracking

---

## Edge Cases & Considerations

1. **No Vocabulary Selected:**
   - Disable questions or use default vocabulary
   - Show warning when starting game

2. **Vocabulary Too Small:**
   - Need at least 4 words for multiple choice (1 correct + 3 distractors)
   - Fallback to simpler question types

3. **Game Doesn't Support Pause:**
   - Overlay question anyway
   - Pause game timer
   - Game may continue in background (acceptable)

4. **User Closes Browser:**
   - Save question progress
   - Resume on reload (optional)

5. **Network Issues:**
   - Questions use local vocabulary (no network needed)
   - Only issue is saving statistics (can queue)

6. **Performance:**
   - Don't generate all questions upfront
   - Generate on-demand
   - Cache question generation logic

---

## Testing Checklist

- [ ] Questions appear at correct intervals
- [ ] Game pauses correctly for different game types
- [ ] Game resumes correctly after answering
- [ ] Correct answers give rewards
- [ ] Incorrect answers apply penalties (if enabled)
- [ ] Multiple question types work
- [ ] Works with all game types (HTML, Canvas, etc.)
- [ ] Works with different vocabulary sizes
- [ ] Configuration changes apply correctly
- [ ] Statistics are tracked correctly
- [ ] No memory leaks (timers cleaned up)
- [ ] Works offline
- [ ] Mobile responsive

---

## Future Enhancements

1. **Adaptive Difficulty:**
   - Adjust question difficulty based on performance
   - Focus on words student struggles with

2. **Question Bank:**
   - Pre-generate questions for faster display
   - Cache questions for better performance

3. **Multiplayer Questions:**
   - Race to answer correctly
   - Competitive element

4. **Question Themes:**
   - Match question style to game theme
   - Visual consistency

5. **Analytics:**
   - Track which words are asked most
   - Track answer accuracy per word
   - Identify learning gaps

---

## Open Questions

1. **Should questions be mandatory or skippable?**
   - Recommendation: Mandatory (but allow retry for wrong answers)

2. **Should game timer pause during questions?**
   - Recommendation: Yes, to be fair

3. **Should questions appear at game start/end?**
   - Recommendation: No, only during gameplay

4. **How many questions per game session?**
   - Recommendation: 3-5 questions, configurable

5. **Should wrong answers block progression?**
   - Recommendation: No, but apply penalty (configurable)

---

## Next Steps

1. Review and approve this plan
2. Start with Phase 1 implementation
3. Test with one game type first
4. Iterate based on feedback
5. Expand to all games and question types


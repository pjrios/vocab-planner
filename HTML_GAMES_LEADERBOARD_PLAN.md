# HTML Games Leaderboard Scoring Plan

## Overview
HTML/Scratch games don't have built-in scoring, but we can track gameplay metrics and create leaderboard scores based on performance.

## Games Analysis

### 1. Level Devil (16 levels)
**Current Data Available:**
- Level reached (1-16)
- Deaths per level
- Total deaths
- Time per level
- Total time

**Scoring Strategy:**
Primary: Level reached (higher = better)
Secondary: Total deaths (fewer = better)
Tertiary: Total time (less = better)

**Score Formula:**
```
score = (level * 1000000) - (deaths * 1000) - (timeInSeconds)
```

**Examples:**
- Level 2, 1 death, 45s = 2,000,000 - 1,000 - 45 = **1,998,955**
- Level 1, 4 deaths, 60s = 1,000,000 - 4,000 - 60 = **995,940**
- Level 1, 6 deaths, 90s = 1,000,000 - 6,000 - 90 = **993,910**

**Leaderboard Display:**
```
Rank | Name | Level | Deaths | Time | Score
1    | Bob  | 2     | 1      | 45s  | 1,998,955
2    | Alice| 1     | 4      | 60s  | 995,940
3    | Tom  | 1     | 6      | 90s  | 993,910
```

### 2. 3D Ball Roll
**Possible Metrics:**
- Completion percentage (0-100%)
- Time to complete
- Attempts/restarts

**Scoring Strategy:**
```
score = (percentage * 10000) - (timeInSeconds) - (attempts * 100)
```

**Example:**
- 100% in 120s, 3 attempts = 1,000,000 - 120 - 300 = **999,580**

### 3. Appel (Apple Catching Game)
**Possible Metrics:**
- Apples caught
- Time played
- Accuracy (caught/missed ratio)

**Scoring Strategy:**
```
score = (applesCaught * 100) - (misses * 50) - (timeInSeconds / 10)
```

### 4. Ball Blast
**Possible Metrics:**
- Balls destroyed
- Time survived
- Waves completed

**Scoring Strategy:**
```
score = (ballsDestroyed * 10) + (wavesCompleted * 1000) - (timeInSeconds)
```

## Implementation Plan

### Phase 1: Data Collection

#### For Level Devil:
1. **Enhance existing monitoring** - Already tracks level/deaths/time
2. **Send detailed data** - Modify postMessage to include:
   ```javascript
   {
     type: 'level-devil-score',
     score: calculatedScore,
     level: currentLevel,
     deaths: totalDeaths,
     time: totalTimeSeconds,
     gameOver: true
   }
   ```

#### For Other Games:
1. **Add monitoring scripts** to each HTML game
2. **Track metrics** based on game type
3. **Send data** via postMessage when game ends

### Phase 2: Score Calculation

#### Level Devil Scoring Function:
```javascript
function calculateLevelDevilScore(level, deaths, timeSeconds) {
  // Level is primary (1,000,000 points per level)
  // Deaths are secondary penalty (1,000 points per death)
  // Time is tertiary penalty (1 point per second)
  const levelScore = level * 1000000;
  const deathPenalty = deaths * 1000;
  const timePenalty = timeSeconds;
  
  return levelScore - deathPenalty - timePenalty;
}
```

#### Comparison Logic:
```javascript
function compareLevelDevilScores(scoreA, scoreB) {
  // Higher score = better
  return scoreB - scoreA;
}
```

### Phase 3: Database Schema

#### Firestore Structure:
```javascript
{
  userId: "user123",
  name: "Student Name",
  grade: "5th",
  gameId: "level-devil",
  score: 1998955,
  metadata: {
    level: 2,
    deaths: 1,
    timeSeconds: 45,
    timestamp: serverTimestamp()
  },
  timestamp: serverTimestamp()
}
```

### Phase 4: Leaderboard Display

#### Display Format:
```
🏆 Level Devil Leaderboard

Rank | Name        | Level | Deaths | Time  | Score
-----|-------------|-------|--------|-------|----------
1    | Alice       | 2     | 1      | 45s   | 1,998,955
2    | Bob         | 1     | 4      | 60s   | 995,940
3    | Charlie     | 1     | 6      | 90s   | 993,910
```

#### Sorting:
1. Primary: Level (descending)
2. Secondary: Deaths (ascending)
3. Tertiary: Time (ascending)

### Phase 5: Code Changes

#### student.js Updates:
1. **Update loadHTMLGame()** to accept score metadata
2. **Add score calculation functions** for each game type
3. **Update saveHighScore()** to handle metadata
4. **Update loadLeaderboard()** to display metadata

#### Level Devil HTML Updates:
1. **Enhance postMessage** to include level/deaths/time
2. **Calculate score** before sending
3. **Send on game over** or level completion

## Detailed Scoring Formulas

### Level Devil
```
Score = (Level × 1,000,000) - (Deaths × 1,000) - (Time in seconds)

Priority:
1. Level (most important)
2. Deaths (fewer is better)
3. Time (less is better)
```

### 3D Ball Roll
```
Score = (Percentage × 10,000) - (Time in seconds) - (Attempts × 100)

Priority:
1. Completion percentage
2. Time
3. Attempts
```

### Appel
```
Score = (Apples Caught × 100) - (Misses × 50) - (Time ÷ 10)

Priority:
1. Apples caught
2. Accuracy (fewer misses)
3. Time
```

### Ball Blast
```
Score = (Balls Destroyed × 10) + (Waves × 1,000) - (Time in seconds)

Priority:
1. Waves completed
2. Balls destroyed
3. Time survived
```

## Implementation Steps

### Step 1: Level Devil (Priority)
1. ✅ Already has level/death/time tracking
2. Update postMessage to send: `{ level, deaths, time, score }`
3. Update student.js to calculate and save score
4. Update leaderboard display to show level/deaths/time

### Step 2: Other Games
1. Add monitoring scripts to each game
2. Track relevant metrics
3. Send data via postMessage
4. Calculate scores on student side

### Step 3: Leaderboard UI
1. Update leaderboard display to show metadata
2. Add sorting by level/deaths/time
3. Add filters (by level, by grade, etc.)

## Questions to Consider

1. **Score Updates**: Should we update score on every level completion or only on game over?
   - **Recommendation**: Only on game over (final score)

2. **Multiple Attempts**: Should we keep best score or latest score?
   - **Recommendation**: Best score (highest level, fewest deaths, least time)

3. **Partial Progress**: What if student closes game mid-level?
   - **Recommendation**: Save progress, but only update leaderboard on level completion

4. **Time Tracking**: Should we track total time or time per level?
   - **Recommendation**: Total time (simpler, Level Devil already does this)

5. **Display Format**: Show raw score or formatted (Level X, Y deaths, Z time)?
   - **Recommendation**: Show both - formatted for readability, score for sorting

## Next Steps

1. ✅ Analyze current Level Devil implementation
2. Update Level Devil postMessage to include metadata
3. Update student.js to calculate and save Level Devil scores
4. Update leaderboard display for Level Devil
5. Test with real gameplay
6. Repeat for other HTML games


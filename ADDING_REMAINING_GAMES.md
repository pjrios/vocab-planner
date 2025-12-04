# Guide: Adding Remaining Games

## ✅ Already Added

1. **radius-raid** - Space shooter
2. **packabunchas** - Puzzle game
3. **spacepi** - Tower defense
4. **mystic-valley** - Multiplayer platformer (just added)
5. **slash-knight** - Adventure platformer (just added)

---

## 🎮 Games Requiring Build Process

These games need to be built before they can be integrated. Here's how to add each one:

### 1. **black-hole-square-master** (Puzzle Game)

**Build Steps:**
```bash
cd js/games/black-hole-square-master
npm install
npm run build  # or check package.json for build command
```

**After Build:**
- Find the built HTML file (likely in `dist/` or `build/` folder)
- Add to `gamesList` in `js/student.js`:
  ```javascript
  { id: 'black-hole-square', name: 'Black Hole Square', icon: '⬛', desc: 'Clean up the squares!' }
  ```
- Add to `htmlGames` array
- Add case in `startGame()` in `js/student/studentGames.js`:
  ```javascript
  else if (type === 'black-hole-square') {
      this.loadHTMLGame(
          'black-hole-square',
          'js/games/black-hole-square-master/dist/index.html', // Adjust path to built file
          null,
          gameOverCallback,
          canvas,
          gameStage
      );
  }
  ```

---

### 2. **glitch-buster-master** (Action Game)

**Build Steps:**
```bash
cd js/games/glitch-buster-master
# Check Makefile or build.js for build command
make  # or: node build.js
```

**After Build:**
- Built file should be in `src/` or root directory
- Follow same integration steps as above
- Game ID: `glitch-buster`
- Icon suggestion: `🎮` or `💥`

---

### 3. **js13k-callisto-main** (3D Action Game)

**Build Steps:**
```bash
cd js/games/js13k-callisto-main
npm install
npm run build  # Creates production build
# or: npm run dev  # For development build
```

**After Build:**
- Built file should be in root or `dist/` folder
- This is a 3D WebGL game - may need special iframe sizing
- Follow same integration steps
- Game ID: `callisto`
- Icon suggestion: `🚀` or `👨‍🚀`

---

### 4. **js13k2021-main** (TypeScript Game)

**Build Steps:**
```bash
cd js/games/js13k2021-main
npm install
npm run start  # or: node build.js
```

**After Build:**
- Built file should be in root or `dist/` folder
- This uses TypeScript, so build may take longer
- Follow same integration steps
- Game ID: `js13k2021` (or check the game's actual name)
- Icon suggestion: `🎯`

---

### 5. **the-maze-of-space-goblins-main.zip** (Needs Extraction)

**First Step:**
```bash
cd js/games
unzip the-maze-of-space-goblins-main.zip
```

**Then:**
- Check if it's a standalone HTML file or needs building
- If standalone HTML: Follow steps for Mystic Valley/Slash Knight
- If needs build: Follow build process steps above

---

## 📝 Integration Template

For any new game, use this template:

### Step 1: Add to `gamesList` in `js/student.js`
```javascript
{ id: 'game-id', name: 'Game Name', icon: '🎮', desc: 'Game description!' }
```

### Step 2: Add to `htmlGames` array (if HTML/iframe game)
```javascript
this.htmlGames = [..., 'game-id'];
```

### Step 3: Add case in `startGame()` in `js/student/studentGames.js`
```javascript
else if (type === 'game-id') {
    this.loadHTMLGame(
        'game-id',
        'js/games/path/to/game.html',
        null, // or 'game-id-score' if adding score reporting
        gameOverCallback,
        canvas,
        gameStage
    );
}
```

### Step 4: Add iframe sizing (if needed) in `loadHTMLGame()`
```javascript
else if (gameId === 'game-id') {
    iframe.style.width = '100%';
    iframe.style.height = '600px'; // Adjust as needed
    // ... other styling
}
```

### Step 5: (Optional) Add Score Reporting
- Add score monitoring script in `getScoreMonitoringScript()`
- Change `null` to `'game-id-score'` in `loadHTMLGame()` call
- Add to `gamesWithLeaderboard` array if you want leaderboard

---

## 🎯 Quick Reference

**Current Total Games:** 15
- Canvas-based: 7 games
- HTML/iframe: 8 games (including 3 with leaderboards)

**After adding all remaining games:** ~20 games total

---

## ⚠️ Notes

1. **Build Requirements:** Make sure you have Node.js installed for games requiring npm
2. **File Paths:** Always use relative paths from project root
3. **Encoding:** Use `encodeURI()` for file paths with spaces
4. **Testing:** Test each game in browser before adding to ensure it works
5. **Score Reporting:** Not all games support score reporting - add it only if the game tracks scores

---

## 🚀 Next Steps

1. Start with games that have clear build instructions
2. Test each built game in a browser first
3. Add one game at a time and test thoroughly
4. Consider adding score reporting for games that track scores


# Vocabulary Learning Web App

A static, client-side vocabulary learning application designed for GitHub Pages.

## Features
- **Teacher Mode**: Create, edit, and export vocabulary sets.
- **Student Mode**: Interactive activities (Matching, Flashcards) and progress tracking.
- **No Backend**: Runs entirely in the browser using JSON files.
- **Repo-based Images**: Images are stored in the repository and referenced by path.

## How to Run Locally

### Option 1: Using the Launcher (Recommended)
1.  Double-click `start_app.command` in the project folder.
2.  This will start a local server and open your browser to `http://localhost:8000`.

### Option 2: Manual Server
If you prefer the terminal:
```bash
python3 -m http.server 8000
# Then open http://localhost:8000
```

*Note: Opening `index.html` directly may cause issues with loading vocabulary files due to browser security policies (CORS).*

## Building Games

Some games in the arcade require building before they can be played:
- **JS13K 2021**
- **Callisto**
- **Glitch Buster**

### Option 1: Double-Click (Recommended)
1. Double-click `build-games.command` in the project folder.
2. A Terminal window will open and build all games.
3. The window will stay open so you can see the results.

### Option 2: Command Line
If you prefer the terminal:
```bash
./build-games.sh
```

**Note**: If you encounter npm permission errors, fix them with:
```bash
sudo chown -R $(whoami) ~/.npm
```

If games fail to build, they will show a helpful error message when you try to play them, with instructions on how to build them manually.

## Teacher Instructions

### Creating a New Vocabulary Set
1.  Go to **Teacher Mode**.
2.  Fill in the Unit details (ID, Name, etc.).
3.  Add words. For images, enter the path relative to the repo root (e.g., `images/unit1/cat.png`).
4.  Click **Export JSON**.

### Adding Images
1.  Add your image files to the `images/` folder in the repository (organize by unit folders).
2.  Push the images to GitHub.
3.  Use the path `images/folder/filename.png` in the Teacher interface.

### Publishing
1.  Push this code to a GitHub repository.
2.  Go to **Settings > Pages**.
3.  Select `main` branch as the source.
4.  Your site will be live at `https://<username>.github.io/<repo-name>/`.

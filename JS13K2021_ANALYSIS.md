# JS13K 2021 Game Analysis

## Overview
JS13K 2021 is a TypeScript-based 2D platformer game that uses WebGL for rendering. It's designed for the JS13K competition (13KB size limit), so it uses aggressive minification and code compression.

## Architecture

### Source Structure
```
src/
├── index.html          # HTML template with placeholders
├── index.ts            # Main game loop and initialization
├── globals.ts          # Global utilities, math functions, audio (ZzFX)
├── state.ts            # Game state management, physics, level logic
├── render.ts           # WebGL rendering system
├── sprite.ts           # Sprite animation system
├── synth.ts            # Audio synthesis
├── glConsts.ts         # WebGL constants
├── shaders.gen.ts      # Generated shader code (from build)
├── main.vert           # Vertex shader source
└── main.frag           # Fragment shader source
```

### Build Process
1. **Shader Minification**: Uses `shader_minifier.exe` (requires Mono on macOS)
   - Processes `.vert` and `.frag` files
   - Generates `src/shaders.gen.ts`
   
2. **TypeScript Compilation**: Compiles `.ts` files to JavaScript in `build/`

3. **Bundling**: Uses Rollup to bundle all JS into `build/bundle.js`

4. **Code Injection**: Injects bundled JS into `src/index.html` template
   - Replaces `__CODE__` placeholder
   - Creates final `build/index.html`

5. **Compression**: Uses RegPack and advzip for size optimization

### Key Components

#### Game Loop (`index.ts`)
- Uses `requestAnimationFrame` for rendering
- Fixed timestep physics (33ms ticks)
- Manages level progression and save state
- Handles menu and gameplay states

#### Game State (`state.ts`)
- Physics-based movement with gravity
- Orbital mechanics for planet interaction
- SDF (Signed Distance Field) collision detection
- Level completion tracking

#### Rendering (`render.ts`)
- WebGL-based rendering
- Uses two canvases: C0 (WebGL) and C1 (2D, hidden)
- Shader-based level rendering using SDFs

#### Audio (`synth.ts` + `globals.ts`)
- Uses ZzFXMicro for procedural audio generation
- No external audio files

## Integration Options

### Option 1: Use Built Version (Recommended)
**Path**: `js/games/js13k2021-main/build/index.html`

**Requirements**:
- Build must complete successfully
- Needs Mono installed: `brew install mono`
- Build creates self-contained HTML file

**Pros**:
- Fully optimized and minified
- Single file, easy to load
- Production-ready

**Cons**:
- Requires build process
- Mono dependency

### Option 2: Use Source Files with TypeScript Compilation
**Path**: `js/games/js13k2021-main/src/index.html`

**Requirements**:
- Compile TypeScript to JavaScript
- Bundle with Rollup
- Handle shader compilation

**Pros**:
- Can modify source code
- Easier debugging

**Cons**:
- Still needs build process
- More complex setup

### Option 3: Create Simplified Build (Skip Shader Minification)
**Modified Build Process**:
1. Skip shader minification step (use unminified shaders)
2. Compile TypeScript
3. Bundle with Rollup
4. Inject into HTML

**Pros**:
- No Mono dependency
- Faster build
- Still functional

**Cons**:
- Larger file size (but still acceptable for our use)

## Current Issues

1. **Mono Required**: Shader minification needs Mono
   - Error: `/bin/sh: mono: command not found`
   - Solution: `brew install mono` or skip shader minification

2. **Build Output Location**: Build creates `build/index.html`, not root `index.html`
   - Current code looks for: `js/games/js13k2021-main/index.html`
   - Should look for: `js/games/js13k2021-main/build/index.html`

3. **Source Files**: Source HTML template has placeholders (`__CODE__`) that need to be replaced

## Recommended Solution

### Short-term: Fix Path and Use Source Fallback
1. Update path in `studentGames.js` to check `build/index.html` first
2. If not found, try source files (won't work without build)
3. Show clear error message

### Long-term: Create Simplified Build Script
1. Create a build variant that skips shader minification
2. Use TypeScript compiler directly
3. Bundle with Rollup
4. Create working `index.html` without Mono

## Game Features
- 19 levels (level0.json through level18.json)
- Physics-based platformer with orbital mechanics
- WebGL rendering with custom shaders
- Procedural audio generation
- LocalStorage save state
- Menu system with level selection

## Dependencies
- TypeScript 4.4.2
- Rollup 2.56.3
- RegPack (for code compression)
- advzip (for final compression)
- shader_minifier.exe (requires Mono)

## Next Steps
1. Update file path in `studentGames.js` to `build/index.html`
2. Create simplified build script that skips Mono requirement
3. Test game loading with built version
4. Consider score reporting integration


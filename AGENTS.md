# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

PlatinumTee is a browser-based 3D golf simulation game built with Three.js and vanilla JavaScript ES6 modules. The game features realistic golf physics, club selection, course generation, and a complete scoring system.

## Development Commands

This is a static web application with no build process. To develop:

```bash
# Serve the files using a local server (required for ES6 modules)
python -m http.server 8000
# or
npx serve .
# or
php -S localhost:8000
```

Navigate to `http://localhost:8000` to play the game.

## Architecture Overview

The codebase uses a modular ES6 architecture with clear separation of concerns:

### Core Module Structure

- **`js/main.js`** - Main entry point, orchestrates initialization and animation loop
- **`js/gameState.js`** - Central state management with callbacks, handles game flow and scoring
- **`js/physics.js`** - Ball physics simulation including wind, terrain collision, and club mechanics
- **`js/course.js`** - Procedural course generation with terrain, obstacles, and hole placement
- **`js/clubs.js`** - Golf club specifications and recommendation system
- **`js/camera.js`** - Dynamic camera system with multiple view modes
- **`js/controls.js`** - Input handling for keyboard and UI interactions
- **`ui.js`** - UI management and DOM manipulation (note: located in root, not js/)

### Key Architectural Patterns

1. **Module Communication**: Modules communicate through explicit imports and callback registration rather than global state
2. **State Machine**: Game uses clear state transitions (AIMING → POWER → ACCURACY → IN_FLIGHT → EVALUATING)
3. **Physics Integration**: Realistic ball physics with terrain height detection and club-specific behavior
4. **Procedural Generation**: Dynamic hole generation with par ratings, distances, and obstacle placement

## Key Development Notes

### Physics System
- Uses `YARDS_TO_UNITS = 0.5` conversion (1 game unit = 2 yards)
- Different clubs have unique physics properties (loft, distance, accuracy)
- Terrain height affects ball bounce and collision detection
- Special putting physics with reduced bounce and friction

### Game Flow
- Game state managed through centralized `gameState.js` with callback system
- Camera automatically follows ball during flight and adjusts for different game states
- Automatic club recommendation based on distance to hole
- Complete scoring system with par calculations and score card tracking

### Course Generation
- Procedural hole generation with random par values (3, 4, or 5)
- Distance ranges: Par 3 (100-250 yards), Par 4 (250-470 yards), Par 5 (470-650 yards)
- Dynamic obstacle placement (trees, bunkers) that avoids direct fairway paths
- Terrain height mapping for realistic ball physics

## File Organization

- Main HTML entry point: `index.html`
- Core game logic: `js/` directory with modular ES6 files
- UI management: `ui.js` (root level)
- Styling: `style.css`
- Legacy/backup files: `*_orig.html`, `script_orig.js` (can be ignored)

## Common Development Tasks

### Adding New Clubs
1. Update `CLUBS` object in `js/clubs.js` with specifications
2. Add UI selector in `index.html`
3. Update recommendation logic in `recommendClub()`

### Modifying Physics
- Adjust constants in `js/physics.js` (`GRAVITY`, `AIR_RESISTANCE`, `GROUND_FRICTION`)
- Modify club-specific behavior in `BallPhysics.calculatePowerScaling()`
- Update terrain collision in `BallPhysics.update()`

### Course Modifications
- Hole generation logic in `course.js:generateNewHole()`
- Obstacle placement in `addDecorativeElements()`
- Terrain height calculation in `getTerrainHeightAt()`

## Testing the Game

Since this is a visual game, testing involves:
1. Start local server and navigate to game
2. Test all club types across different distances
3. Verify physics behavior (ball bounces, rolls, stops appropriately)
4. Check scoring system through complete 9-hole rounds
5. Test edge cases (ball in hole detection, extreme wind conditions)

The game includes extensive console logging for debugging physics and state transitions.
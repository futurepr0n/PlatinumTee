# Gameplay Feature Implementation

This file tracks the implementation of new gameplay features to enhance the game experience.

- [ ] **Scoring System**
  - [ ] Add a stroke counter to the game state.
  - [ ] Increment the counter on each swing.
  - [ ] Display the current stroke count in the UI.
- [ ] **Multiple Holes**
  - [ ] Design data structure for multiple holes.
  - [ ] Implement logic to detect when a hole is completed.
  - [ ] Add functionality to load the next hole.
- [ ] **Expanded Club Selection**
  - [ ] Define properties for a full set of clubs (e.g., in `js/clubs.js`).
  - [ ] Update the UI to allow selecting from the new clubs.
  - [ ] Use club properties to affect swing outcomes.
- [ ] **Wind System**
  - [ ] Add wind speed and direction to the game state.
  - [ ] Apply wind force to the ball in the physics simulation.
  - [ ] Display a wind indicator in the UI.
- [ ] **Sound Effects**
  - [ ] Source or create sound assets for swing, impact, etc.
  - [ ] Create an audio manager to play sounds.
  - [ ] Trigger sounds on game events.
- [ ] **Game States**
  - [ ] Create a Main Menu screen.
  - [ ] Create a "Hole Complete" / "Course Complete" screen.
  - [ ] Implement state transitions (e.g., from menu to game).

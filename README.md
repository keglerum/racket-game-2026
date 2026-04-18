# Racket Drift - AI Handoff README

This file is a fast handoff for another AI model (or developer) to continue work if chat context is lost.

## Game Vision
Racket Drift is a browser arcade game where the player tilts a racket with mouse/touch movement to keep balls alive and guide them through obstacle gates.

Core feel goals:
- Responsive, arcade-like paddle control
- Clear readability at speed
- Reward survival + precision
- Gradual chaos through splitting balls and increasing difficulty

## Core Gameplay
- Player controls a racket near the lower part of the screen.
- Balls bounce on the racket and move through scrolling pole obstacles.
- Pole tips are splitters:
  - Bigger balls split into two smaller balls.
  - Very tiny balls are removed on splitter hit (not ignored).
- Balls can score by crossing the cyan MASS GATE inside openings.

## Scoring and Leaderboard
Current ranking is transparent and fair by formula:
- Rank Score = Mass + (Time x 2.5)

Leaderboard sort order:
1. Higher rank score
2. Higher mass
3. Higher survived time

Displayed columns:
- Rank position
- Rank score
- Mass
- Time endured
- Obstacles mode (Moving or Static)
- Layout mode/seed label

## Difficulty and Leveling
- Multiple level configs increase challenge over time.
- Obstacle movement can be toggled in settings.
- Pole drift up/down exists and can be enabled/disabled by setting.

## Ball Systems
- Tennis-ball style rendering with visible seam pattern.
- Spin is applied from hit angle and paddle movement.
- Mild spin-influenced curve (Magnus-like effect) in flight.
- Depth axis (pseudo-3D):
  - Ball can move toward player (z axis), appear larger, then bounce back.
  - Near-screen rebound triggers bonk SFX.
- Tiny-ball minimum state:
  - Fancy pulse/glow effect at minimum size
  - Timed regrowth toward target size
  - Mass and area update as radius grows

## Audio
- Web Audio is used (no external audio files required).
- Audio unlock is tied to user interaction events.
- Includes:
  - Bonk SFX on near-screen bounce
  - Lightweight procedural background music loop

## UI and Settings
- In-game Settings panel includes:
  - Animate obstacles toggle
  - Layout mode: Public Fixed or Development Randomized
  - Public obstacle set selection
- Scoreboard and settings are integrated into UI.

## Deterministic Layouts for Public Fairness
No external obstacle-position database is required for core fairness.
Deterministic behavior is handled via seeded generation:
- Public mode uses fixed seeds (same obstacle sequence for everyone).
- Dev mode uses randomized seed each run.

## Production Server
Node/Express + SQLite server exists.

### Main endpoints
- GET /api/health
- GET /api/config
- GET /api/scores?limit=50
- POST /api/scores

### Persistence
- SQLite database stored under data/racket_drift.db
- Stores obstacle sets and score rows

### Running locally
1. Install dependencies:
   npm install
2. Start server:
   npm start
3. Open:
   http://localhost:8080/

## Key Files
- index.html: Main layout, HUD, settings panel, scoreboard shell
- styles.css: Visual styling and responsive layout
- game.js: Full game logic, rendering, physics, audio, settings, score handling
- server.js: Production API + static hosting + SQLite storage
- package.json: Scripts and dependencies

## Current Known Notes
- Browser audio requires user gesture before sound plays.
- Performance is tuned with adaptive low-performance behavior for heavier browsers.

## Suggested Next Feature Ideas
1. Tiny planes flyby event with doppler-like sound cues.
2. New hard mode options beyond moving obstacles:
   - turbulence bands
   - pulse gates
   - periodic hazard waves
3. Distinct challenge presets with separate leaderboards.

## Quick Resume Checklist for Another AI
1. Read game.js first for real gameplay behavior.
2. Verify server is running on localhost:8080.
3. Check leaderboard consistency between frontend sorting and /api/scores ordering.
4. Test tiny-ball splitter and regrowth flow.
5. Keep arcade feel; avoid over-physical simulation unless requested.

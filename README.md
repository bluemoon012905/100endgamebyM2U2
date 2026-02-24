# 100endgamebyM2U2

Static web SGF reader for the 100 Go endgame problems in `9x9 Endgame Book 1`.

Attribution: puzzles are provided by Reddit user **M2U2**.

## Features

- GitHub Pages hostable (no build step, plain HTML/CSS/JS)
- Loads all `001.sgf` to `100.sgf`
- Interactive 9x9 board rendering
- Three play modes: Exploration, Responsive Puzzle, Answer Key Puzzle
- SGF variation support (branch selection + branch-by-click on board)
- SGF note/comment display (`C[...]`)
- Setup stone support (`AB`, `AW`, `AE`)
- Capture logic during replay
- Marker/label display for common annotations (`LB`, `MA`, `TR`, `SQ`, `CR`)
- Puzzle navigation controls:
  - `Next Puzzle` (sequential by default)
  - Optional `Shuffle next puzzle` setting for random next puzzle
  - `Previous Puzzle` uses viewed-history (goes back to puzzles you actually opened)
- Settings panel can be collapsed/expanded
- Optional `Confirm moves` interaction setting
- Optional `Shuffle orientation` setting (random board rotation per loaded puzzle; not persisted)

## Controls

- Toolbar: problem picker, reload, previous puzzle, next puzzle
- Settings panel:
  - `Settings` button toggles panel expand/collapse
  - `Change Mode`
  - `Confirm moves`
  - `Shuffle next puzzle`
  - `Shuffle orientation`
- Exploration keyboard shortcuts:
  - Left/Right: previous/next move
  - Home/End: first/last move

## Run locally

Open `index.html` from a local static server.

Example:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In repo settings, enable Pages.
3. Set source to deploy from `main` branch root (`/`).

That is enough because this project is fully static.

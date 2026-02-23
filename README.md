# 100endgamebyM2U2

Static web SGF reader for the 100 Go endgame problems in `9x9 Endgame Book 1`.

## Features

- GitHub Pages hostable (no build step, plain HTML/CSS/JS)
- Loads all `001.sgf` to `100.sgf`
- Interactive 9x9 board rendering
- SGF variation support (branch selection + branch-by-click on board)
- SGF note/comment display (`C[...]`)
- Setup stone support (`AB`, `AW`, `AE`)
- Capture logic during replay
- Marker/label display for common annotations (`LB`, `MA`, `TR`, `SQ`, `CR`)

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

# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/aben00/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/aben00/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Sunset Heat** — an original open-world crime game in the coastal city of Solmarina, built for make.fun's "Make GTA 6" bounty. Steal cars, outrun the Solmarina PD, and run three story jobs for Marco before the sun goes down. Everything is original: the city, the characters and the story — no Rockstar names, assets or places.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Or open `game/index.html` directly in a desktop browser (no build step, no network — three.js is vendored under `game/vendor/three/`).

## How to play

- **WASD** move / drive, **mouse** (drag or click to lock) to look, **Shift** run
- **E** enter / steal a car (parked cars are free; stealing a moving one earns a wanted star)
- **F** or click to punch, **Space** brake while driving, **P** pause, **M** mute
- **Wanted system**: crimes raise your stars, police cruisers chase and ram you, officers on foot will bust you if they hold you. Lay low and the heat fades.
- **Three story missions**: First Wheels, Sunset Run (90-second delivery), Heat Escape — with a minimap, mission markers, dialogue, and cash rewards. Progress saves in your browser.

## What is in here

- `game/index.html` — the page, HUD and screens
- `game/src/` — the game: `config.js` (tuning + missions), `city.js` (Solmarina's layout + ground/facade textures), `world.js` (simulation: driving, traffic AI, pedestrians, police, wanted, missions), `render.js` (three.js scene, chase camera, HUD, minimap), `audio.js` (synthesised WebAudio: engine, sirens, effects), `input.js`, `shots.js` (deterministic screenshot staging)
- `game/vendor/three/` — vendored three.js
- `main.ts` — builds the hand-in (`/output` with `game/`, `screenshots/`, `dossier.json`)
- `screenshots/` — four real renders of the game (see `shots.json` for the `?shot=` scenes)

---

<sub>Entered on [make.fun](https://make.fun/?ref=bh1grvtt&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

# Sunset Heat — Solmarina

[![Play on make.fun](https://img.shields.io/badge/make.fun-Sunset_Heat-orange)](https://make.fun/c/gta6-01?ref=bh1grvtt)
[![Competition: Make GTA 6](https://img.shields.io/badge/competition-gta6--01-blue)](https://make.fun/c/gta6-01?ref=bh1grvtt)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An open-world crime game in the spirit of GTA 6, built for the
[make.fun gta6-01 bounty](https://make.fun/c/gta6-01?ref=bh1grvtt).
A coastal city at dusk, yours to steal, outrun and finish — all original:
its city, characters, vehicles, names, story, art and sounds. No Rockstar
names, assets or places anywhere in it.

## The game

Solmarina is a sun-soaked grid city on the sea: drive the beach road at
sunset, walk the sidewalks, steal cars, dodge the Solmarina PD, and run
three jobs for Marco before the sun goes down.

- **Open world on foot and by car** — WASD + mouse, third-person chase
  camera, traffic that drives the grid and pedestrians on the sidewalks.
- **Steal and drive** — parked cars are free; a traffic car or a taxi is
  a crime, and the owner calls it in. Cars handle, brake and reverse, and
  a hard crash bends them: top speed falls (a wreck does 69 km/h against
  108 healthy), the exhaust smokes, and parking in the green safehouse
  garage fixes it for free.
- **Wanted level and police** — five stars, cruisers that chase and ram,
  officers on foot who will grab you. Lose the heat and it fades.
- **Three story missions** — First Wheels ($250), Sunset Run ($400, on a
  90-second clock) and Heat Off ($750), with Marco's dialogue, for $1,450
  in all. Then free roam.
- **Eight hidden cash stashes** ($40–$75 each) — gold diamonds floating
  over the spot, gold dots on the minimap, E to grab.
- **Combat** — F or click to punch; a pedestrian goes down and the law
  notices. Get caught with no health and it is a $120 fine and a wake-up
  at the safehouse.
- **Full HUD** — cash, wanted stars, health and car-condition bars, a
  minimap (safehouse, stashes, objective, police), mission card with the
  timer, context prompts ("E — Get in", "E — Steal this car ★",
  "Repairing…"), and a horn (H) that scatters the crowd ahead.
- **Polish** — sunset lighting, a wooden pier with five boats in the sea,
  yellow taxis with roof signs, synthesised WebAudio (engine, sirens,
  two-tone horn, clock ticks), auto-quality scaling for software
  rendering, start / pause / busted screens, and a localStorage save.

## Controls

| Key | Does |
| --- | --- |
| WASD / arrows | Move / drive |
| Mouse drag | Look around |
| E | Enter a car, steal a car, grab a stash, exit a car |
| F / click | Punch |
| H | Horn |
| Shift | Run |
| Space | Brake |
| P | Pause |
| M | Mute |
| Enter | Start / continue |

## Play it

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network request: `game/index.html` opens in desktop
Chrome and plays from its own files, with three.js vendored under
`game/vendor/`.

## Screenshots

`shots.json` lists the four shots and the `?shot=` scene behind each
(`cover`, `chase`, `mission`, `start`, all `&seed=7`): the red car running
for the beach at 108 km/h, the foot chase with a cruiser behind, the
punch beside the red car, and the title over the dusk skyline.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to `/output` and writes
`/output/dossier.json` with the vendored make.fun library.

## Layout

- `game/index.html` — page, HUD, overlays, import map
- `game/src/main.js` — boot, fixed-step loop, screens
- `game/src/world.js` — the rules: driving, traffic, police, missions,
  stashes, damage, bust, save
- `game/src/render.js` — three.js scene, chase camera, HUD, minimap,
  auto-quality
- `game/src/city.js` — Solmarina: merged buildings, painted ground,
  pier, boats, lamps, safehouse
- `game/src/config.js` — every tuning number, place and payout
- `game/src/input.js` — keyboard, mouse orbit, one-shot presses
- `game/src/audio.js` — synthesised WebAudio: engine, siren, horn
- `game/src/random.js` — seeded random (mulberry32)
- `game/src/shots.js` — the four `?shot=` screenshot scenes

## License

MIT — see [LICENSE](LICENSE).

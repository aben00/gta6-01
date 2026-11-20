# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/aben00/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/aben00/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Sunset Heat** is an open-world crime game built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01): a coastal city
at dusk, yours to steal, outrun and finish. Everything in it is original —
the city, the characters, the vehicles, the names, the story, the art and
the sounds. No Rockstar names, assets or places anywhere.

## What it is

Solmarina is a grid city on the sea, one sunset away from dark. You arrive
on foot with $50 and a phone call from Marco, who has three jobs for you.
Drive the beach road, walk the sidewalks, take cars that are not yours,
dodge the Solmarina PD, and find the cash the city hides.

- **On foot and behind the wheel** — third-person chase camera, WASD plus
  mouse look, traffic driving the grid and pedestrians on the sidewalks.
- **Stealing** — a parked car is free. A traffic car or a taxi is a crime:
  the owner calls it in and a wanted star follows. Cars accelerate, brake
  and reverse, and a hard crash bends them: top speed falls (a wreck does
  69 km/h against 108 healthy), the exhaust smokes, and parking in the
  green safehouse garage fixes it for free.
- **Heat** — five wanted stars. Cruisers chase and ram; once the heat is
  high enough, officers run you down on foot and hold you until the bust.
  Stay quiet and the stars fade, one every twenty seconds.
- **Three jobs for Marco** — First Wheels ($250), Sunset Run ($400, on a
  90-second clock) and Heat Off ($750), $1,450 in all, with Marco's
  dialogue. Finish them and the city is yours to roam.
- **Eight hidden stashes** — $40 to $75 each, marked by a floating gold
  diamond and a gold dot on the minimap. Walk up and press E.
- **A fight, if you want one** — F or click to punch. A pedestrian goes
  down and the law notices. Run out of health and it is a $120 fine and a
  wake-up at the safehouse.
- **The whole HUD** — cash, wanted stars, health and car-condition bars,
  a minimap (safehouse, stashes, objective, police), a mission card with
  the timer, context prompts ("E — Get in", "E — Steal this car ★",
  "Repairing…"), and a horn (H) that scatters the crowd ahead of you.
- **The look and the sound** — sunset lighting, a wooden pier with five
  boats in the sea, yellow taxis with roof signs, synthesised WebAudio
  (engine, sirens, two-tone horn, clock ticks), auto-quality scaling for
  software rendering, start / pause / busted screens, and a localStorage
  save that survives a reload.

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

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

No build step and no network request: `game/index.html` opens in desktop
Chrome and plays from its own files, with three.js vendored under
`game/vendor/`.

## Screenshots

`shots.json` lists the four shots and the `?shot=` scene behind each
(`cover`, `chase`, `mission`, `start`, all `&seed=7`): the red car running
north up the beach road at 108 km/h with a taxi ahead, the foot chase
between two cruisers closing in, the punch beside the red car with a
cruiser closing in, and the title over the dusk skyline.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` stages `game/` and `screenshots/` into `/output` and writes
`/output/dossier.json` with the vendored make.fun library.

## Files

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

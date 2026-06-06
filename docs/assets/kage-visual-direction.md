# KAGE Visual Direction

KAGE's strongest visual is the existing app icon. Treat it as the source of truth.

## Main Visual

Use the app icon directly as the hero object.

- Keep the black rounded session portal.
- Keep the warm ivory terminal frame.
- Keep the dark terminal screen.
- Keep the amber command prompt.
- Keep the three agent dots and the connecting arc.

Avoid adding extra dashboards, long command blocks, mascot parts, or explanatory UI to the main visual.

## CLI Visual

The CLI visual should feel like the app icon in a running state.

- Use only `>` and `_` on the screen.
- Do not add `k`, `KAGE`, or long command text inside the small screen.
- Use the three dots for Codex, Qoder, and Claude.
- In SVG/animation, keep the subtle arc connecting the dots.
- In plain ASCII, keep the mark simpler so it does not become a face.

## Color

- Prompt amber: `#f2b84b`
- Codex blue: `#3b82f6`
- Qoder green: `#15a074`
- Claude clay: `#cf7654`
- Ivory: `#f7f2e6`
- Charcoal: `#0b1013`

## Current Assets

- `kage-main-visual.svg`: hero visual based on the app icon.
- `kage-cli-visual.svg`: static CLI visual derived from the app icon.
- `kage-cli-animated.svg`: running-state CLI visual.
- `kage-cli-ascii.txt`: plain terminal-safe ASCII mark.
- `kage-cli-ansi.sh`: ANSI color terminal preview.

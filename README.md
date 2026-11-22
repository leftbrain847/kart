# Kart

An original 3D kart racer for iPhone (three.js): two riders per kart who swap seats and items, drift mini-turbos, rocket starts, slipstreams, four items and seven AI rivals on Coral Coast.

**Play:** tilt the phone to steer (or drag the left half); hold BRAKE to pivot through tight turns; hold DRIFT while turning and release for a turbo; hold DRIFT just before GO for a rocket start; ITEM throws the back rider's item; SWAP trades riders. Keys: arrows/A-D steer, Space drift, S/down brake, X item, C swap.

## Deployed
- Day snapshot: `snapshots/2026-11-21 - Kart.html` (frozen; never edited)
- Sprint demo: `npm run build:demo` → `dist/demo/page.html`

Built on [app_builder](https://github.com/leftbrain847/app_builder).

- **Friends:** behind your Cloudflare login at `/<id>/` on your apps hostname (see `platform/platform.config.json`).
- **Google Play:** only if `targets.play.enabled` is true in `app.config.json`. Tag `vX.Y.Z` to build and upload to the internal track.

## Run

```sh
npm ci
npm run dev      # local dev server
npm test         # the rules' tests
```

| Command | Does |
| --- | --- |
| `npm run dev` | local dev server (no login, no host) |
| `npm test` | the rules' tests |
| `npm run worker:dev` | the full Worker locally (uses no Cloudflare quota) |
| `npm run build:play` | the offline Play bundle, checked for network code |

Deploys happen in CI on every push to `main`, followed by a smoke test that rolls the deploy back if the app isn't behind the login wall.

## Budget

Every app shares one free Cloudflare pool per day (resets 00:00 UTC). This app's rough cost:

- **Solo:** a ranked race sends its inputs in 20 s chunks: about 10 requests per race. The server replays the race (about 0.2 s CPU) to check the score.
- **Turn-based:** 1 request to join, plus 1 request per 20 moves. The room sleeps between moves and costs nothing while idle.

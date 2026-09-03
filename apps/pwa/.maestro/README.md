# Maestro flows

Native E2E flows. One flow + screenshot baseline per converged screen.

Run all: `maestro test .maestro/`
Run one: `maestro test .maestro/<flow>.yaml`

Prereqs: app built and installed on a booted iOS simulator
(`npx expo run:ios`). Screenshots land in `.maestro/screenshots/` and are
committed as visual baselines — regenerate deliberately, review diffs.

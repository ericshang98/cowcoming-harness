# Contributing

Use Node 24 and Python 3.11+. Run `npm ci`, `npm test`, `npm run test:bridge`, and `npm run build` before opening a pull request. Keep changes scoped and include the actual validation performed.

A new robot should add a profile, an explicit server-side executor, and contract tests for expiry, ownership, unsupported actions, cancellation, and truthful completion evidence. Do not add device discovery or automatic hardware activation to install/build scripts.

A new model adapter must return an Intent, keep credentials out of browser code, obey cancellation, and fail without dispatching on malformed output. Include offline fixtures; never require contributor credentials in CI.

Do not commit `.env`, tokens, personal ports/calibration, node_modules, generated bundles, downloaded weights, or unlicensed character assets. Original contributions are provided under this repository's Apache-2.0 license. Describe separately licensed optional assets explicitly.

The standalone repository is the release surface for this package. The Cowcoming website keeps a copy under `harness/`; synchronize releases as reviewed source updates and record the source commit, not by editing both silently.

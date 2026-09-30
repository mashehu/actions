# Contributing

## Setup

```sh
npm ci
```

## Build, lint and test

```sh
npm run format:check   # Prettier
npm run lint            # ESLint
npm run type-check       # tsc, no emit
npm test                # Jest
npm run test:coverage    # Jest, with a coverage summary (what CI runs)
npm run package          # Rollup: builds every action under src/actions/*
npm run all              # All of the above except test:coverage, in that order
```

Run `npm run all` before opening a pull request. CI runs the same checks, plus
the coverage summary and the `dist/` freshness check.

## dist/ is committed

See [README.md](../README.md#layout) for why. Never edit a file under
`actions/*/dist/` by hand: after changing anything under `src/`, run
`npm run package` and commit the result.

## Dependency bump pull requests

Dependabot cannot run `npm run package`, so a dependency bump leaves the
committed bundles stale and CI's `dist/` freshness check fails. After merging a
dependency bump into the pull request branch, run `npm run package` and commit
the updated `actions/*/dist/index.js` files onto that branch yourself.

## Adding a new action

1. Create `src/actions/<name>/index.ts`. This is the action's entry point.
2. Put code shared with other actions in `src/lib/`, not in the action's own
   directory.
3. Add `actions/<name>/action.yml` with the action's inputs, outputs, and
   `runs: using: node24, main: dist/index.js`.
4. Add tests next to the code they test, as `<file>.test.ts`.
5. Run `npm run package` to build `actions/<name>/dist/index.js`, and commit it
   together with the source.

`script/rollup.config.ts` discovers every `src/actions/*/index.ts`
automatically; no build config changes are needed for a new action.

## Conventions

Lessons from past reviews, so a new action does not repeat them:

- Move shared code to `src/lib/` as soon as a second action needs it. Do not let
  two actions carry byte-for-byte copies of the same logic.
- Do not re-prove a pure function through mocks in an orchestration test. Keep
  one or two wiring tests, and test the logic itself directly, on the pure
  function.
- A run that tests nothing must never report success.
- Never interpolate an input into a shell string; build an argument array. Log
  untrusted values encoded, and do not let a library echo them unescaped.
- Validate a README workflow example with actionlint, and also reason through it
  by hand: actionlint checks syntax, not whether the workflow would actually
  work.
- Escape every value that comes from outside an action (a config file, a
  comment, a file name, a test name) before it reaches a job summary, and encode
  it before it reaches a log. This applies to a new action too: writing a
  summary or logging a value inherits this rule. It was fixed in two actions and
  then reintroduced in a third one stage later, which is why it is written down
  here.
- A privileged job (one holding a secret or a push credential) runs no
  third-party action. Use `gh` or a first-party action instead.

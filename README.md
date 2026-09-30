# nf-core/actions

Centralised reusable workflows and TypeScript actions for nf-core pipelines.

A pipeline repo keeps a thin stub workflow that calls a reusable workflow here,
pinned to a major tag such as `@v1`. All logic, and all security fixes, live in
this repo. When a maintainer moves the `v1` tag, every pipeline that calls it
picks up the change on its next run. Changing a value in 141 pipeline repos
needs a 141-repo campaign; changing it here needs one tag move.

Today this repo provides one workflow,
[`fix-linting.yml`](#the-fix-lintingyml-workflow). More of the pipeline
template's workflows will move here, one at a time.

## Configuration precedence

Every setting a shared workflow or action reads resolves in this order:

1. The workflow `with:` input, if the calling pipeline set one.
2. The `.nf-core.yml` file in the calling pipeline's repo, if it sets one.
3. A built-in default in this repo.

Falling back to the built-in default logs a warning in the Actions run, so a
pipeline maintainer can see when they are relying on a default instead of an
explicit choice.

`.nf-core.yml` also records the pipeline's template version. Code in this repo
reads that version and can change behaviour for older pipelines instead of
breaking them outright.

## The `ci:` config block

The [`read-config`](actions/read-config) action resolves CI settings and exposes
them as outputs for later steps and reusable workflows. It reads a `ci:` block
from the pipeline's `.nf-core.yml`. That block does not exist by default; a
pipeline adds it only to override a setting. For example:

```yaml
# .nf-core.yml in a pipeline repo
nf_core_version: '4.0.3'
repository_type: pipeline
template:
  name: rnaseq
  org: nf-core
  version: '3.27.0dev'
ci:
  nextflow_versions: ['24.10.0', 'latest-everything']
```

Omitting a key under `ci:` is normal. It means the pipeline follows the central
default for that setting, and `read-config` logs a warning in the Actions run
naming the setting and the default used, so a maintainer can see where the value
came from.

Each setting follows the same three-step order as
[Configuration precedence](#configuration-precedence) above: the action input
first, then the value at that setting's path under `ci:`, then the built-in
default.

A setting whose value is a list, a number, or a boolean is available on the
input side and the output side as JSON, for example
`'["docker","singularity"]'`, `'12'`, or `'true'`, so a calling workflow can use
`fromJSON()` to build a matrix or gate an `if:` condition.

`read-config` also exposes `nf-core-version`, `repository-type`, and
`pipeline-name`, read from the pipeline's existing schema outside `ci:`. These
have no built-in default: if a pipeline's `.nf-core.yml` does not set them, the
output is an empty string and `read-config` logs a warning.

**Do not rely on `ci:` yet.** nf-core/tools rebuilds `.nf-core.yml` from the
fields it knows, so `nf-core pipelines sync` or `bump-version` drops the `ci:`
block. [nf-core/tools#4453](https://github.com/nf-core/tools/pull/4453) fixes
this; until it is released, a pipeline that sets any `ci:` key can lose it on
the next sync.

## The `validate-patch` action

The [`validate-patch`](actions/validate-patch) action is the last gate before a
privileged job applies an untrusted patch and pushes it. It does not apply the
patch; it only decides whether the patch is safe to apply, and logs an audit
trail of what it contains.

```yaml
- name: Validate the patch
  uses: nf-core/actions/actions/validate-patch@v1
  with:
    patch-path: ${{ runner.temp }}/lint-fix/lint-fix.patch
```

Given `patch-path`, it rejects, each with its own message:

- a path that is not a regular file, including a symlink (an uploaded artifact
  can contain one);
- an empty file;
- a file over `max-size-bytes` (default 5 MiB, generous for a formatting diff
  and far below anything that should reach a privileged job);
- a file that is not a valid git patch, checked independently of the current
  tree (`git apply --numstat`);
- a well-formed patch that no longer applies to the current tree
  (`git apply --check`), for example because the branch moved after the patch
  was built.

A missing file at `patch-path` is not an error: `has-patch` is `false`, which is
the normal outcome when a linter made no changes. Every other problem above
fails the action. On success, it logs the touched files and the diffstat, and
publishes `files-changed`, so the run's log and summary show what the privileged
job is about to commit before it commits it.

`validate-patch` never passes `--unsafe-paths` to `git apply`, relying on git's
own refusal to write outside the checkout.

**What it deliberately does not block.** It does not reject a patch that touches
`.github/workflows/**`, `.nf-core.yml`, or any other specific path. The linter
this repo runs (`prek`, see below) legitimately reformats YAML, including
workflow files, so blocking changes to them would break real fixes, not just
attacks. Three things bound the residual risk instead: the commit lands on the
pull request's own branch, still subject to normal review before merge, not on a
protected branch directly; GitHub itself refuses a push that touches
`.github/workflows/**` from a token without the `workflow` OAuth scope, so
keeping that scope off the bot's token (if operationally possible) closes this
specific escalation path independently of this action; and `prepare-fix` (below)
never holds a credential, so a hostile pre-commit hook running there has nothing
to steal even if it tries. A maintainer reviewing a bot-authored "automated lint
fix" commit should give it the same scrutiny as a human-authored one: the commit
message does not imply the diff was checked for anything beyond being a
well-formed, applying patch.

## The `fix-linting.yml` workflow

[`fix-linting.yml`](.github/workflows/fix-linting.yml) implements the
`@nf-core-bot fix linting` pull request comment command. It replaces a vendored
workflow that ran a pull request's own lint hooks in the same job that held the
bot's push credential: hook code the pull request defines could read that
credential. This workflow never does that. See SECURITY.md for the trust
boundary it follows.

### Three jobs, one trust boundary

- **`acknowledge`** gates the whole run. It runs only when the comment is on a
  pull request and contains the command, then checks the commenter's permission
  against the repository (via the API, not `author_association`, which reflects
  a user's relationship to the repository, not their current permission level)
  and whether the pull request's head branch is protected. See
  [Branch protection and the commenter gate](#branch-protection-and-the-commenter-gate)
  for the exact rule. Holds `contents: read`, to look up the pull request and
  the branch, and `issues: write`, to react to the comment; it never checks out
  the pull request.
- **`prepare-fix`** checks out the pull request and runs its lint hooks
  (`prek`). This is untrusted code. It holds `contents: read` and
  `pull-requests: read`, nothing that can write, and no secret is referenced
  anywhere in the job. The checkout does not persist credentials. If the hooks
  changed anything, it stages the change and builds a binary git patch from the
  staged diff, and uploads it as an artifact; a hook failure that produces no
  patch fails the job outright. It never commits: `push-fix` (below) is the only
  job that creates a commit.
- **`push-fix`** holds the credential. It re-checks out the pull request head
  and confirms it still matches the SHA `prepare-fix` ran against (the patch no
  longer describes the tree otherwise), downloads and validates the patch with
  `validate-patch` above, applies it, and commits and pushes as the bot with
  hooks and GPG signing explicitly disabled for those two commands. It never
  runs a file that came from the pull request.

Every comment reaction (`eyes`, `+1`, `hooray`, `confused`) is posted with
`gh api`, not a third-party action: `push-fix` holds the bot's credential, and a
privileged job runs no third-party action, so the reaction there could not use
one anyway. `acknowledge` uses the same `gh api` call for consistency, even
though it is not itself privileged.

### Branch protection and the commenter gate

`push-fix` pushes with the bot's organisation-wide token. A collaborator with
plain `write` access cannot push to a protected branch directly, so admitting
any `write` user here would turn the bot into a way around that: the contributor
controls `.pre-commit-config.yaml` and every hook `prepare-fix` runs, so the
"lint fix" patch it produces can contain any diff at all.

`acknowledge` decides using `GET /repos/{owner}/{repo}/branches/{branch}` on the
pull request's head branch, read with `contents: read`. It does not use the
branch-protection endpoint itself
(`GET /repos/{owner}/{repo}/branches/{branch}/protection`): that one needs
`admin` on the repository, which this job does not hold and should not need just
to decide whether to run.

| Head branch   | Author                     | `write` / `admin` collaborator |
| ------------- | -------------------------- | ------------------------------ |
| Not protected | Allowed                    | Allowed                        |
| Protected     | **Denied** (needs `admin`) | Allowed only with `admin`      |

A release pull request's head branch is typically protected, so its own author
gets no exemption there: the bot would otherwise push to a protected branch on
the author's behalf, which the author could not do by pushing directly
themselves. On an ordinary, unprotected branch, the author exemption is
unchanged: the bot only ever pushes to the author's own branch, so letting them
trigger it grants them nothing beyond what pushing to it themselves already
would.

A failed lookup (the pull request API call, the branch API call, or the
collaborator-permission API call) denies the request and prints why, instead of
the job aborting silently: a maintainer commenting on someone else's pull
request sees a clear reason if the check itself could not run, not a missing
reaction and no explanation.

### Configuration

`prepare-fix` reads `.nf-core.yml` before checking out the pull request, so a
setting used to run the pull request's own hooks comes from the repository's own
default branch, not from the pull request under test. Today that is one value:
the Nextflow version, taken from `read-config`'s existing `nextflow-versions`
output (the first configured version). `prek` itself needs no separate version
setting: its action pin already fixes a version, and every hook's own version is
already pinned in the pipeline's own `.pre-commit-config.yaml`. Nothing new was
added to `.nf-core.yml` for this workflow.

### Pipeline stub

```yaml
# .github/workflows/fix-linting.yml in a pipeline repo
name: fix-linting

on:
  issue_comment:
    types: [created]

concurrency:
  group: ${{ github.workflow }}-${{ github.event.issue.number }}

permissions: {}

jobs:
  fix-linting:
    # Filtered here as well as in the called workflow, so ordinary issue
    # comments do not start a run.
    if: >-
      github.event.issue.pull_request && contains(github.event.comment.body,
      '@nf-core-bot fix linting')
    permissions:
      actions: read
      contents: read
      issues: write
      pull-requests: read
    uses: nf-core/actions/.github/workflows/fix-linting.yml@v1
    secrets:
      BOT_TOKEN: ${{ secrets.nf_core_bot_auth_token }}
```

`BOT_TOKEN` is optional and named explicitly: this stub never uses
`secrets: inherit`. Omitting it is valid syntax, but every job that needs it
then fails with a clear message instead of silently pushing with the workflow's
own default token. `secrets.nf_core_bot_auth_token` above is the existing
organisation secret already available to nf-core pipeline repos; only the name
on the left, `BOT_TOKEN`, is this workflow's own contract, so a pipeline whose
bot secret is named differently only needs to change the right-hand side.

The calling job grants `actions: read`, `contents: read`, `issues: write`, and
`pull-requests: read`: the union of what `fix-linting.yml`'s three jobs request
between them. A called workflow can only narrow the permissions the calling job
holds, never widen them, so a job here that granted only, say, `contents: read`
would make GitHub reject the run at validation the moment `push-fix` tried to
use `issues: write` to react to the comment.

The `concurrency` group has no `cancel-in-progress`: a second "fix linting"
comment on the same pull request queues behind the first instead of racing it
mid-push, which could otherwise fail with a non-fast-forward push.

### Migrating from the vendored workflow

- **Job names changed.** The vendored workflow's single `fix-linting` job (or
  the two-job `prepare-fix` / `push-fix` split some pipelines already carry)
  becomes `acknowledge`, `prepare-fix`, and `push-fix`. Update branch protection
  or status checks that name the old job, if any did.
- **The bot secret is now named and passed explicitly.** A stub that checked out
  or pushed directly with `secrets.nf_core_bot_auth_token` (or used
  `secrets: inherit`) now passes it as `BOT_TOKEN` in the `secrets:` block
  above; the reusable workflow fails clearly if it is missing, rather than
  falling back to the default token.
- **The commenter gate is stricter.** A comment from someone with neither write
  access nor pull request authorship is now rejected before anything runs,
  checked against the API rather than `author_association`.
- **No custom `.pre-commit-config.yaml` handling changed.** `prepare-fix` runs
  `prek` the same way the vendored workflow ran it; a pipeline's own hook
  configuration needs no change.

### Referencing the sibling actions

`fix-linting.yml` calls `read-config` and `validate-patch` with GitHub's `$/`
self-repository syntax, for example `uses: $/actions/validate-patch`. `$/`
resolves to this repo at the exact commit already running, with no separate tag
lookup. A plain `owner/repo/path@v1` reference is re-resolved each time a job
starts, so a release that moves `v1` mid-run could mix commits within one run.

`$/` requires Actions runner 2.336.0 or later and does not exist on GitHub
Enterprise Server. GitHub-hosted runners (`ubuntu-latest`, which every job here
uses) always meet that. `$/` is not yet recognised by actionlint v1.7.12;
`.github/actionlint.yaml` carries a narrow, named `ignore` rule for it, to
remove once actionlint catches up.

## Tag policy

Two different pinning rules apply, for two different trust relationships:

- **Pipelines pin this repo by tag.** A pipeline's stub workflow calls
  `nf-core/actions/...@v1`. This repo, and the `nf-core` GitHub org, are
  controlled by nf-core maintainers, so a moving major tag is the intended
  distribution mechanism.
- **This repo pins external actions by commit SHA.** Any third-party action used
  inside this repo's own workflows (`actions/checkout`, `github/codeql-action`,
  and so on) is pinned to a full commit SHA, with a `# vX` comment for context.
  Actions under the `nf-core`, `nextflow-io`, and `seqeralabs` orgs are the
  exception: those orgs are nf-core-controlled, so they are pinned to a major
  tag, the same as pipelines pin this repo. The trust chain ends at code nf-core
  has reviewed.

A tag ruleset on this repo blocks anyone from moving a major tag (`v1`, `v2`,
...) outside the [release workflow](.github/workflows/release.yml), which gates
the move behind required reviewers.

## Layout

```
actions/<name>/action.yml   Action metadata: runs.using: node24, runs.main: dist/index.js
actions/<name>/dist/        Committed, built bundle for that action
src/actions/<name>/         TypeScript source for that action's entry point
src/lib/                    Shared code used by more than one action
__tests__/                  Unit tests, mirroring src/
.github/workflows/          Reusable workflows pipelines call, plus this repo's own CI
```

`actions/*/dist/**` is committed. It is built from `src/`, never written by
hand, and CI fails if it is out of date. The bundle is not minified and has no
sourcemap, so a pull request diff shows the actual code change under review.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to build, test, and add an
action.

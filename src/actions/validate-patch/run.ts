import { lstatSync } from 'node:fs'
import * as core from '@actions/core'
import { getExecOutput } from '@actions/exec'
import { encodeOutput } from '../../lib/encode-output.js'
import { escapeHtml } from '../../lib/escape-html.js'
import { isEnoent } from '../../lib/is-enoent.js'
import { describeType } from '../../lib/file-type.js'
import { requireOnPath } from '../../lib/require-on-path.js'
import { writeSummaryBestEffort } from '../../lib/write-summary.js'
import { DEFAULT_MAX_SIZE_BYTES, parseMaxSizeBytes } from './args.js'
import { parseNumstat, type NumstatEntry } from './numstat.js'

interface Inputs {
  patchPath: string
  maxSizeBytes: number
}

function readInputs(): Inputs {
  return {
    patchPath: core.getInput('patch-path', { required: true }),
    maxSizeBytes: parseMaxSizeBytes(
      core.getInput('max-size-bytes') || String(DEFAULT_MAX_SIZE_BYTES)
    )
  }
}

interface GitApplyResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Runs `git apply <args>` and returns its captured output.
 *
 * JSON-encodes the args before logging: it renders a newline in an untrusted
 * value (the patch path) as \n, so it can't inject a workflow command into the
 * log.
 * silent: true stops @actions/exec echoing its own unencoded command line,
 * which would otherwise reopen the same injection.
 */
async function gitApply(args: string[]): Promise<GitApplyResult> {
  await requireOnPath(
    'git',
    'The calling workflow must have git on PATH before this action runs.'
  )
  core.info(`Running: git ${JSON.stringify(args)}`)
  return getExecOutput('git', ['apply', ...args], {
    ignoreReturnCode: true,
    silent: true
  })
}

function reportAbsent(patchPath: string): void {
  core.info(`No file at '${patchPath}'. Reporting no patch present.`)
  core.setOutput('has-patch', encodeOutput(false))
  core.setOutput('files-changed', encodeOutput(0))
}

/**
 * Logs the touched-file list and the diffstat as the audit trail for what
 * the caller is about to apply and push. Every line is given a fixed
 * prefix, including the JSON-encoded file list: git renders a patch's own
 * (attacker-controlled) filenames here, and a line that starts with '::'
 * would otherwise be read as a workflow command.
 */
function logAuditTrail(entries: NumstatEntry[], diffstat: string): void {
  core.info(`Touched files: ${JSON.stringify(entries.map((e) => e.path))}`)
  for (const line of diffstat.split('\n')) {
    if (line.trim() !== '') core.info(`diffstat> ${line}`)
  }
}

function writeSummary(entries: NumstatEntry[]): Promise<void> {
  core.summary
    .addHeading('validate-patch: patch contents', 3)
    .addRaw(`${String(entries.length)} file(s) touched.`, true)
    .addTable([
      [
        { data: 'File', header: true },
        { data: 'Added', header: true },
        { data: 'Deleted', header: true }
      ],
      ...entries.map((entry) => [
        escapeHtml(entry.path),
        entry.added === null ? 'binary' : String(entry.added),
        entry.deleted === null ? 'binary' : String(entry.deleted)
      ])
    ])
  return writeSummaryBestEffort()
}

/**
 * Validates an untrusted patch file before a privileged job applies it:
 * rejects anything that is not a plain, size-capped, well-formed git patch
 * that applies cleanly to the current tree, and logs what it touches.
 *
 * A missing file is not an error: it is the normal "the linter made no
 * changes" case, reported as has-patch: false so the caller can skip the
 * apply step instead of treating it as a failure.
 */
export async function run(): Promise<void> {
  const inputs = readInputs()

  let stat: ReturnType<typeof lstatSync>
  try {
    // lstat, not stat: a symlink must be judged by what it is, not by
    // following it into whatever it points at.
    stat = lstatSync(inputs.patchPath)
  } catch (error) {
    if (isEnoent(error)) {
      reportAbsent(inputs.patchPath)
      return
    }
    throw error
  }

  if (!stat.isFile()) {
    throw new Error(
      `Patch path '${inputs.patchPath}' is not a regular file (found ${describeType(stat)}). Refusing to read it.`
    )
  }

  if (stat.size === 0) {
    throw new Error(`Patch file '${inputs.patchPath}' is empty.`)
  }

  if (stat.size > inputs.maxSizeBytes) {
    throw new Error(
      `Patch file '${inputs.patchPath}' is ${String(stat.size)} bytes, over the ${String(inputs.maxSizeBytes)} byte cap.`
    )
  }

  // --numstat only parses the patch itself; it does not need the file it
  // touches to exist or match, so it validates format independently of the
  // current tree. This is what separates "not a valid git patch" below from
  // "does not apply to the current tree" further down.
  const numstat = await gitApply(['--numstat', '--', inputs.patchPath])
  if (numstat.exitCode !== 0) {
    throw new Error(
      `Patch file '${inputs.patchPath}' is not a valid git patch. git said:\n${numstat.stderr}${numstat.stdout}`
    )
  }
  const entries = parseNumstat(numstat.stdout)

  // --check applies the patch against the current index and working tree,
  // in memory, without writing anything: it fails on a context mismatch
  // (the tree moved) even though the patch is well-formed. --index matches
  // the workflow's real apply step, so this checks the exact command that
  // is about to run, not a close approximation of it.
  const check = await gitApply(['--check', '--index', '--', inputs.patchPath])
  if (check.exitCode !== 0) {
    throw new Error(
      `Patch file '${inputs.patchPath}' does not apply to the current tree. git said:\n${check.stderr}${check.stdout}`
    )
  }

  const stat2 = await gitApply(['--stat', '--', inputs.patchPath])
  logAuditTrail(entries, stat2.stdout)

  core.setOutput('has-patch', encodeOutput(true))
  core.setOutput('files-changed', encodeOutput(entries.length))

  await writeSummary(entries)
}

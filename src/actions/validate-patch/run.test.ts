// These tests run real git against a real temporary repository: git's own
// behaviour (does this parse as a patch, does it apply to this tree) is the
// thing under test here, not something worth re-deriving through a mock.
// Only '@actions/core' is mocked, to capture inputs/outputs/logs without a
// real Actions environment.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest
} from '@jest/globals'

const getInput = jest.fn<(name: string) => string>()
const info = jest.fn()
const setOutput = jest.fn<(name: string, value: string) => void>()
const write = jest.fn(() => Promise.resolve())

const summary: Record<string, jest.Mock> = {}
summary.addHeading = jest.fn(() => summary)
summary.addRaw = jest.fn(() => summary)
summary.addTable = jest.fn(() => summary)
summary.write = write

jest.unstable_mockModule('@actions/core', () => ({
  getInput,
  info,
  warning: jest.fn(),
  setOutput,
  summary
}))

const { run } = await import('./run.js')

// These tests run real git against a throwaway repository, because git's own
// behaviour on a real tree is what is under test. Ignore the developer's
// global and system config so the result cannot depend on it. Commit signing
// matters most: a machine that signs by default makes every commit here wait
// on a signing agent, and fail when that agent does.
function git(cwd: string, args: string[]): void {
  execFileSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null'
    }
  })
}

function outputValues(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const call of setOutput.mock.calls) {
    result[call[0]] = call[1]
  }
  return result
}

function setInputs(overrides: Record<string, string> = {}): void {
  const values: Record<string, string> = { 'max-size-bytes': '', ...overrides }
  getInput.mockImplementation((name) => values[name] ?? '')
}

describe('validate-patch', () => {
  let repoDir: string
  let previousCwd: string

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'validate-patch-'))
    previousCwd = process.cwd()
    git(repoDir, ['init', '--quiet'])
    git(repoDir, ['config', 'user.email', 'test@example.com'])
    git(repoDir, ['config', 'user.name', 'Test'])
    writeFileSync(join(repoDir, 'file.txt'), 'a\n')
    git(repoDir, ['add', 'file.txt'])
    git(repoDir, ['commit', '--quiet', '-m', 'initial'])
    process.chdir(repoDir)
    setInputs()
  })

  afterEach(() => {
    process.chdir(previousCwd)
    rmSync(repoDir, { recursive: true, force: true })
  })

  /** Builds a patch by editing file.txt, diffing it, then reverting the edit. */
  function buildValidPatch(): string {
    writeFileSync(join(repoDir, 'file.txt'), 'b\n')
    const diff = execFileSync(
      'git',
      ['diff', '--binary', '--no-ext-diff', 'file.txt'],
      { cwd: repoDir, encoding: 'utf8' }
    )
    git(repoDir, ['checkout', '--quiet', '--', 'file.txt'])
    const patchPath = join(repoDir, 'the.patch')
    writeFileSync(patchPath, diff)
    return patchPath
  }

  it('accepts a real, applying patch: has-patch true, files-changed 1', async () => {
    const patchPath = buildValidPatch()
    setInputs({ 'patch-path': patchPath })

    await run()

    expect(outputValues()['has-patch']).toBe('true')
    expect(outputValues()['files-changed']).toBe('1')
  })

  it('reports has-patch false, without failing, when the file is absent', async () => {
    setInputs({ 'patch-path': join(repoDir, 'does-not-exist.patch') })

    await expect(run()).resolves.toBeUndefined()

    expect(outputValues()['has-patch']).toBe('false')
    expect(outputValues()['files-changed']).toBe('0')
  })

  it('rejects a symlink with a message naming it', async () => {
    const linkPath = join(repoDir, 'link.patch')
    symlinkSync(join(repoDir, 'file.txt'), linkPath)
    setInputs({ 'patch-path': linkPath })

    await expect(run()).rejects.toThrow(/symlink/)
    expect(setOutput).not.toHaveBeenCalled()
  })

  it('rejects an empty file', async () => {
    const emptyPath = join(repoDir, 'empty.patch')
    writeFileSync(emptyPath, '')
    setInputs({ 'patch-path': emptyPath })

    await expect(run()).rejects.toThrow(/is empty/)
    expect(setOutput).not.toHaveBeenCalled()
  })

  it('rejects a file over the size cap', async () => {
    const bigPath = join(repoDir, 'big.patch')
    writeFileSync(bigPath, 'x'.repeat(100))
    setInputs({ 'patch-path': bigPath, 'max-size-bytes': '10' })

    await expect(run()).rejects.toThrow(/over the 10 byte cap/)
    expect(setOutput).not.toHaveBeenCalled()
  })

  it('rejects a file that is not a git patch at all', async () => {
    const notAPatchPath = join(repoDir, 'not-a-patch.txt')
    writeFileSync(notAPatchPath, 'hello world, this is not a patch\n')
    setInputs({ 'patch-path': notAPatchPath })

    await expect(run()).rejects.toThrow(/not a valid git patch/)
    expect(setOutput).not.toHaveBeenCalled()
  })

  it('rejects a well-formed patch that does not apply to the current tree', async () => {
    const patchPath = buildValidPatch()
    // Move the tree on: the patch's context ("a") no longer matches.
    writeFileSync(join(repoDir, 'file.txt'), 'something else entirely\n')
    git(repoDir, ['add', 'file.txt'])
    git(repoDir, ['commit', '--quiet', '-m', 'moved on'])
    setInputs({ 'patch-path': patchPath })

    await expect(run()).rejects.toThrow(/does not apply to the current tree/)
    expect(setOutput).not.toHaveBeenCalled()
  })

  it('accepts a valid patch whose path begins with a dash', async () => {
    // Without a '--' separator before the path, git would try to parse
    // '-dash-name.patch' as an option instead of a filename.
    writeFileSync(join(repoDir, 'file.txt'), 'b\n')
    const diff = execFileSync(
      'git',
      ['diff', '--binary', '--no-ext-diff', 'file.txt'],
      { cwd: repoDir, encoding: 'utf8' }
    )
    git(repoDir, ['checkout', '--quiet', '--', 'file.txt'])
    const dashName = '-dash-name.patch'
    writeFileSync(join(repoDir, dashName), diff)
    setInputs({ 'patch-path': dashName })

    await run()

    expect(outputValues()['has-patch']).toBe('true')
    expect(outputValues()['files-changed']).toBe('1')
  })

  it('logs the touched files as one JSON-encoded line', async () => {
    const patchPath = buildValidPatch()
    setInputs({ 'patch-path': patchPath })

    await run()

    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('Touched files: ["file.txt"]')
    )
  })
})

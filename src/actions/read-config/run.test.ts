import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
const warning = jest.fn()
const setOutput = jest.fn<(name: string, value: string) => void>()
const write = jest.fn(() => Promise.resolve())

// The real Summary API returns `this` from addHeading/addTable so calls
// chain, and write() lives on that same instance.
const summary: Record<string, jest.Mock> = {}
summary.addHeading = jest.fn(() => summary)
summary.addTable = jest.fn(() => summary)
summary.write = write

jest.unstable_mockModule('@actions/core', () => ({
  getInput,
  info,
  warning,
  setOutput,
  summary
}))

const { run } = await import('./run.js')

function outputValues(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const call of setOutput.mock.calls) {
    result[call[0]] = call[1]
  }
  return result
}

describe('run', () => {
  let workDir: string
  let previousWorkspace: string | undefined

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'read-config-'))
    previousWorkspace = process.env.GITHUB_WORKSPACE
    process.env.GITHUB_WORKSPACE = workDir
    getInput.mockReturnValue('')
  })

  afterEach(() => {
    if (previousWorkspace === undefined) delete process.env.GITHUB_WORKSPACE
    else process.env.GITHUB_WORKSPACE = previousWorkspace
    rmSync(workDir, { recursive: true, force: true })
  })

  it('uses every default and succeeds when the config file is missing', async () => {
    await run()
    expect(outputValues()['nf-test-version']).toBe('0.9.5')
    expect(outputValues()['max-shards']).toBe('20')
    expect(outputValues()['nf-core-version']).toBe('')
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('No config file found')
    )
  })

  it('fails with a clear message naming the file on malformed YAML', async () => {
    writeFileSync(join(workDir, '.nf-core.yml'), 'template:\n  name: [rnaseq\n')
    await expect(run()).rejects.toThrow(/\.nf-core\.yml/)
  })

  it('parses a real rnaseq-style config, including the read-only fields', async () => {
    writeFileSync(
      join(workDir, '.nf-core.yml'),
      [
        'nf_core_version: 4.0.3',
        'repository_type: pipeline',
        'template:',
        '  name: rnaseq',
        '  org: nf-core',
        '  version: 3.27.0dev',
        'lint:',
        '  files_unchanged: []'
      ].join('\n')
    )

    await run()
    const outputs = outputValues()
    expect(outputs['nf-core-version']).toBe('4.0.3')
    expect(outputs['pipeline-name']).toBe('rnaseq')
    expect(outputs['repository-type']).toBe('pipeline')
    // No input given, so every ci setting falls back to its default.
    expect(outputs['nf-test-version']).toBe('0.9.5')
    expect(outputs['profiles']).toBe('["conda","docker","singularity"]')
  })

  it('encodes lists and numbers as JSON, and strings as plain text', async () => {
    const inputs: Record<string, string> = {
      'nf-test-version': '1.2.3',
      profiles: '["docker","singularity"]',
      'max-shards': '7'
    }
    getInput.mockImplementation((name) => inputs[name] ?? '')

    await run()
    const outputs = outputValues()
    expect(outputs['nf-test-version']).toBe('1.2.3')
    expect(outputs['profiles']).toBe('["docker","singularity"]')
    expect(outputs['max-shards']).toBe('7')
  })

  it('ignores a ci: block in .nf-core.yml, and warns that it is no longer read', async () => {
    writeFileSync(
      join(workDir, '.nf-core.yml'),
      ['ci:', '  runner: 8cpu-linux-x64', '  max_shards: 7'].join('\n')
    )
    await run()
    expect(outputValues()['runner']).toBe('4cpu-linux-x64')
    expect(outputValues()['max-shards']).toBe('20')
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('no longer read')
    )
  })

  it('reads an unquoted version number in .nf-core.yml as the maintainer wrote it', async () => {
    writeFileSync(
      join(workDir, '.nf-core.yml'),
      ['nf_core_version: 2.10'].join('\n')
    )
    await run()
    // YAML parses the unquoted 2.10 as the number 2.1. nf-core/tools released
    // 2.10 through 2.14, so "2.10" and "2.1" are different, real versions.
    const nfCoreVersion = outputValues()['nf-core-version']
    expect(nfCoreVersion).toBe('2.10')
    expect(nfCoreVersion).not.toBe('2.1')
  })

  it('writes no output when a setting fails to resolve', async () => {
    getInput.mockImplementation((name) =>
      name === 'max-shards' ? '"many"' : ''
    )
    await expect(run()).rejects.toThrow(/max-shards/)
    expect(setOutput).not.toHaveBeenCalled()
  })

  it('writes no output when a read-only value has the wrong type', async () => {
    writeFileSync(
      join(workDir, '.nf-core.yml'),
      ['template:', '  name: [rnaseq]'].join('\n')
    )
    await expect(run()).rejects.toThrow(/template\.name/)
    expect(setOutput).not.toHaveBeenCalled()
  })

  it('rejects an absolute config-file path', async () => {
    getInput.mockImplementation((name) =>
      name === 'config-file' ? '/etc/hostname' : ''
    )
    await expect(run()).rejects.toThrow(/config-file/)
    expect(setOutput).not.toHaveBeenCalled()
  })

  it('rejects a config-file path that escapes the workspace', async () => {
    getInput.mockImplementation((name) =>
      name === 'config-file' ? '../../../../etc/hostname' : ''
    )
    await expect(run()).rejects.toThrow(/config-file/)
    expect(setOutput).not.toHaveBeenCalled()
  })

  it('uses an action input over the default', async () => {
    getInput.mockImplementation((name) =>
      name === 'runner' ? '16cpu-linux-x64' : ''
    )
    await run()
    expect(outputValues()['runner']).toBe('16cpu-linux-x64')
  })

  it('fails with a clear message naming the input when profiles is an empty list', async () => {
    getInput.mockImplementation((name) => (name === 'profiles' ? '[]' : ''))
    await expect(run()).rejects.toThrow(/profiles.*empty list/s)
    expect(setOutput).not.toHaveBeenCalled()
  })

  it('resolves config-file relative to the workspace', async () => {
    writeFileSync(
      join(workDir, 'custom.yml'),
      ['template:', '  name: custom-pipeline'].join('\n')
    )
    getInput.mockImplementation((name) =>
      name === 'config-file' ? 'custom.yml' : ''
    )
    await run()
    expect(outputValues()['pipeline-name']).toBe('custom-pipeline')
  })

  it('encodes a value containing a newline and a workflow command before logging it', async () => {
    writeFileSync(
      join(workDir, '.nf-core.yml'),
      ['template:', '  name: "abc\\n::error::pwned"'].join('\n')
    )
    await run()

    const logLine = info.mock.calls
      .map((call) => call[0] as string)
      .find((line) => line.includes('pipeline-name ='))
    expect(logLine).toBeDefined()
    // JSON.stringify renders the embedded newline as the two characters
    // '\' 'n', not an actual line break, so the log line stays one line and
    // no line inside it can start with '::' and be read as a workflow
    // command.
    expect(logLine).not.toContain('\n')
    for (const line of logLine!.split('\n')) {
      expect(line.trim().startsWith('::')).toBe(false)
    }
  })

  it('accepts a config-file name that starts with two dots but is not an escape', async () => {
    writeFileSync(
      join(workDir, '..nf-core.yml'),
      ['template:', '  name: dotted'].join('\n')
    )
    getInput.mockImplementation((name) =>
      name === 'config-file' ? '..nf-core.yml' : ''
    )
    await run()
    expect(outputValues()['pipeline-name']).toBe('dotted')
  })

  it('escapes a value from .nf-core.yml in the summary table', async () => {
    writeFileSync(
      join(workDir, '.nf-core.yml'),
      ['template:', "  name: '<img src=x onerror=alert(1)> & co'"].join('\n')
    )
    await run()

    const [rows] = summary.addTable!.mock.calls[0] as [unknown[][]]
    const nameRow = rows.find((row) => row[0] === 'pipeline-name') as string[]
    expect(nameRow[1]).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; co')
    expect(nameRow[1]).not.toContain('<img')
  })
})

// The settings registry. One entry per setting. Add a setting by adding a
// row here: action.yml, defaults and the resolver all read from this list.
// The drift test in __tests__/read-config checks action.yml against it.

export type ValueKind = 'string' | 'string-list' | 'number' | 'boolean'

export type ValueForKind<K extends ValueKind> = K extends 'string'
  ? string
  : K extends 'string-list'
    ? string[]
    : K extends 'boolean'
      ? boolean
      : number

export interface SettingDef<K extends ValueKind = ValueKind> {
  /** Name of the action output. Also the action input name, when hasInput is true. */
  output: string
  /** Dot-separated path to the value in .nf-core.yml, for example 'ci.nf_test_version'. */
  configPath: string
  kind: K
  /**
   * Value used when nothing else sets it.
   * Read-only settings (hasInput: false) have no real default: they fall
   * back to this and a warning, because the value should already be in the
   * pipeline's existing schema.
   */
  default: ValueForKind<K>
  /** False for read-only settings taken from the existing schema, not from ci:. */
  hasInput: boolean
}

// Infers each row against its own `kind`, so a mismatched default (for
// example `kind: 'number'` with a string default) fails type-check instead
// of widening away into the `SettingDef[]` union below.
export function defineSetting<K extends ValueKind>(
  def: SettingDef<K>
): SettingDef<K> {
  return def
}

/** Fallback for the 'config-file' input. action.yml's declared default must match this. */
export const DEFAULT_CONFIG_FILE = '.nf-core.yml'

// Order here is the order settings appear in action.yml and in the summary table.
export const SETTINGS: readonly SettingDef[] = [
  defineSetting({
    output: 'nf-test-version',
    configPath: 'ci.nf_test_version',
    kind: 'string',
    default: '0.9.5',
    hasInput: true
  }),
  defineSetting({
    output: 'nextflow-versions',
    configPath: 'ci.nextflow_versions',
    kind: 'string-list',
    default: ['25.10.4', 'latest-everything'],
    hasInput: true
  }),
  defineSetting({
    output: 'profiles',
    configPath: 'ci.profiles',
    kind: 'string-list',
    default: ['conda', 'docker', 'singularity'],
    hasInput: true
  }),
  defineSetting({
    output: 'max-shards',
    configPath: 'ci.max_shards',
    kind: 'number',
    default: 20,
    hasInput: true
  }),
  defineSetting({
    output: 'nf-test-workdir',
    configPath: 'ci.nf_test_workdir',
    kind: 'string',
    default: '~',
    hasInput: true
  }),
  defineSetting({
    output: 'runner',
    configPath: 'ci.runner',
    kind: 'string',
    default: '4cpu-linux-x64',
    hasInput: true
  }),
  defineSetting({
    output: 'nextflow-lint',
    configPath: 'ci.nextflow_lint',
    kind: 'boolean',
    // Opt-in: 'nextflow lint' was never part of the pipeline template, so a
    // pipeline that adopts 'linting.yml' must not gain a new failing check
    // by default. See README.md for how a pipeline opts in.
    default: false,
    hasInput: true
  }),
  defineSetting({
    output: 'awsfulltest-required-approvals',
    configPath: 'ci.awsfulltest_required_approvals',
    kind: 'number',
    // Two distinct, trusted approvals. A pipeline with too few maintainers
    // to reach that lowers it in .nf-core.yml.
    default: 2,
    hasInput: true
  }),
  defineSetting({
    output: 'nf-core-version',
    configPath: 'nf_core_version',
    kind: 'string',
    default: '',
    hasInput: false
  }),
  defineSetting({
    output: 'repository-type',
    configPath: 'repository_type',
    kind: 'string',
    default: '',
    hasInput: false
  }),
  defineSetting({
    output: 'pipeline-name',
    configPath: 'template.name',
    kind: 'string',
    default: '',
    hasInput: false
  })
]

/** Second segment of every configPath under the top-level 'ci' key, for the unknown-key check. */
export const KNOWN_CI_KEYS: readonly string[] = SETTINGS.filter((setting) =>
  setting.configPath.startsWith('ci.')
).map((setting) => setting.configPath.slice('ci.'.length))

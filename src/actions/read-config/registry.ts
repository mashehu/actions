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
  /** Name of the action output. Also the action input name, for a setting with no configPath. */
  output: string
  /**
   * Dot-separated path to the value in .nf-core.yml, for example
   * 'template.name'. Set only for the read-only metadata nf-core/tools
   * itself writes to that file; such a setting has no action input. Unset
   * for a CI setting, which comes from the action input or the default and
   * is never read from .nf-core.yml.
   */
  configPath?: string
  kind: K
  /**
   * Value used when nothing else sets it.
   * Read-only settings (with a configPath) have no real default: they fall
   * back to this and a warning, because the value should already be in the
   * pipeline's existing schema.
   */
  default: ValueForKind<K>
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
    kind: 'string',
    default: '0.9.5'
  }),
  defineSetting({
    output: 'nextflow-versions',
    kind: 'string-list',
    default: ['25.10.4', 'latest-everything']
  }),
  defineSetting({
    output: 'profiles',
    kind: 'string-list',
    default: ['conda', 'docker', 'singularity']
  }),
  defineSetting({
    output: 'max-shards',
    kind: 'number',
    default: 20
  }),
  defineSetting({
    output: 'nf-test-workdir',
    kind: 'string',
    default: '~'
  }),
  defineSetting({
    output: 'runner',
    kind: 'string',
    default: '4cpu-linux-x64'
  }),
  defineSetting({
    output: 'nextflow-lint',
    kind: 'boolean',
    // Opt-in: 'nextflow lint' was never part of the pipeline template, so a
    // pipeline that adopts 'linting.yml' must not gain a new failing check
    // by default. See README.md for how a pipeline opts in.
    default: false
  }),
  defineSetting({
    output: 'awsfulltest-required-approvals',
    kind: 'number',
    // Two distinct, trusted approvals. authorize-launch never accepts fewer
    // than two on a pull request review, so a pipeline can only raise this.
    // See README.md's awsfulltest.yml section for why.
    default: 2
  }),
  defineSetting({
    output: 'nf-core-version',
    configPath: 'nf_core_version',
    kind: 'string',
    default: ''
  }),
  defineSetting({
    output: 'repository-type',
    configPath: 'repository_type',
    kind: 'string',
    default: ''
  }),
  defineSetting({
    output: 'pipeline-name',
    configPath: 'template.name',
    kind: 'string',
    default: ''
  })
]

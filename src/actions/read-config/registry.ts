// The metadata registry: one entry per value read from .nf-core.yml. These
// are keys nf-core/tools itself writes and maintains. CI settings are typed
// 'workflow_call' inputs on each reusable workflow instead, never read from
// this file. Add a value by adding a row here; the drift test in
// __tests__/read-config checks action.yml against this list.

export interface MetadataDef {
  /** Name of the action output. */
  output: string
  /** Dot-separated path to the value in .nf-core.yml, for example 'template.name'. */
  configPath: string
}

/** Fallback for the 'config-file' input. action.yml's declared default must match this. */
export const DEFAULT_CONFIG_FILE = '.nf-core.yml'

// Order here is the order outputs appear in action.yml and in the summary table.
export const METADATA: readonly MetadataDef[] = [
  { output: 'nf-core-version', configPath: 'nf_core_version' },
  { output: 'pipeline-name', configPath: 'template.name' }
]

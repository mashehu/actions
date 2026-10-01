// CI settings are typed 'workflow_call' inputs, each declared with its
// default on every reusable workflow that uses it. A setting shared by more
// than one workflow (for example 'nextflow-versions') therefore has its
// default written out more than once; this test keeps those copies from
// drifting apart.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from '@jest/globals'
import { parse } from 'yaml'

interface InputDef {
  type?: string
  default?: unknown
}

interface WorkflowYaml {
  on?: { workflow_call?: { inputs?: Record<string, InputDef> } }
}

const workflowsDir = join(import.meta.dirname, '../.github/workflows')

/** Input name -> every workflow that declares it, with its declaration. */
function inputsByName(): Map<string, { file: string; def: InputDef }[]> {
  const byName = new Map<string, { file: string; def: InputDef }[]>()
  for (const file of readdirSync(workflowsDir).filter((f) =>
    f.endsWith('.yml')
  )) {
    const workflow = parse(
      readFileSync(join(workflowsDir, file), 'utf8')
    ) as WorkflowYaml
    for (const [name, def] of Object.entries(
      workflow.on?.workflow_call?.inputs ?? {}
    )) {
      byName.set(name, [...(byName.get(name) ?? []), { file, def }])
    }
  }
  return byName
}

// Inputs whose value is a JSON array of strings: workflows call fromJSON()
// on them to build a matrix or pick the first entry.
const JSON_LIST_INPUTS = ['nextflow-versions', 'profiles']

describe('reusable workflow input defaults', () => {
  const byName = inputsByName()

  it('gives a shared input the same type and default in every workflow that declares it', () => {
    for (const declarations of byName.values()) {
      const [first] = declarations
      for (const { def } of declarations) {
        expect({ type: def.type, default: def.default }).toEqual({
          type: first!.def.type,
          default: first!.def.default
        })
      }
    }
  })

  it('defaults every JSON-list input to a non-empty JSON array of strings', () => {
    for (const name of JSON_LIST_INPUTS) {
      for (const { def } of byName.get(name) ?? []) {
        const parsed: unknown = JSON.parse(String(def.default))
        expect(Array.isArray(parsed)).toBe(true)
        expect((parsed as unknown[]).length).toBeGreaterThan(0)
        expect((parsed as unknown[]).every((v) => typeof v === 'string')).toBe(
          true
        )
      }
    }
  })
})

import { describe, expect, it } from '@jest/globals'
import { defineSetting } from './registry.js'

describe('defineSetting infers each entry against its own kind', () => {
  it('is exercised by the type-check below; this keeps Jest from reporting an empty suite', () => {
    expect(typeof defineSetting).toBe('function')
  })
})

// Compile-time regression test, not a runtime one: proves that a 'number'
// setting given a string default fails type-check instead of silently
// widening to `string | string[] | number` in the SETTINGS array.
// If SettingDef's generic default (K extends ValueKind = ValueKind) comes
// back, or defineSetting is removed from registry.ts, this line stops
// erroring and `npm run type-check` fails right here.
defineSetting({
  output: 'synthetic-bad-setting',
  configPath: 'ci.synthetic_bad_setting',
  kind: 'number',
  // @ts-expect-error 'number' requires a numeric default, not a string.
  default: 'oops',
  hasInput: true
})

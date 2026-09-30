import { describe, expect, it } from '@jest/globals'
import { escapeHtml } from './escape-html.js'

describe('escapeHtml', () => {
  it('escapes angle brackets and ampersands', () => {
    expect(escapeHtml('<script>alert(1)</script> & co')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; co'
    )
  })

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('docker')).toBe('docker')
  })
})

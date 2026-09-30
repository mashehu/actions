import { describe, expect, it } from '@jest/globals'
import { parseNumstat } from './numstat.js'

describe('parseNumstat', () => {
  it('parses one entry per line', () => {
    expect(parseNumstat('3\t1\tfoo.txt\n5\t0\tbar/baz.txt\n')).toEqual([
      { path: 'foo.txt', added: 3, deleted: 1 },
      { path: 'bar/baz.txt', added: 5, deleted: 0 }
    ])
  })

  it('reads a binary file marker as null counts', () => {
    expect(parseNumstat('-\t-\timage.png\n')).toEqual([
      { path: 'image.png', added: null, deleted: null }
    ])
  })

  it('ignores blank lines', () => {
    expect(parseNumstat('\n1\t1\tfoo.txt\n\n')).toEqual([
      { path: 'foo.txt', added: 1, deleted: 1 }
    ])
  })

  it('returns an empty list for empty output', () => {
    expect(parseNumstat('')).toEqual([])
  })

  it('rejoins a path that itself contains a tab', () => {
    expect(parseNumstat('1\t1\tweird\tname.txt\n')).toEqual([
      { path: 'weird\tname.txt', added: 1, deleted: 1 }
    ])
  })

  it('skips a line with no tabs at all instead of producing a NaN entry', () => {
    expect(
      parseNumstat('warning: something git printed\n1\t1\tfoo.txt\n')
    ).toEqual([{ path: 'foo.txt', added: 1, deleted: 1 }])
  })

  it('skips a line missing the path field', () => {
    expect(parseNumstat('1\t1\n1\t1\tfoo.txt\n')).toEqual([
      { path: 'foo.txt', added: 1, deleted: 1 }
    ])
  })

  it('skips a line whose count is not "-" or a whole number', () => {
    expect(parseNumstat('one\t1\tfoo.txt\n1\t1\tbar.txt\n')).toEqual([
      { path: 'bar.txt', added: 1, deleted: 1 }
    ])
  })
})

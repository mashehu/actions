import { describe, expect, it, jest } from '@jest/globals'

const which = jest.fn<() => Promise<string>>()

jest.unstable_mockModule('@actions/io', () => ({ which }))

const { requireOnPath } = await import('./require-on-path.js')

describe('requireOnPath', () => {
  it('resolves when the tool is on PATH', async () => {
    which.mockResolvedValue('/usr/bin/nf-test')
    await expect(
      requireOnPath('nf-test', 'install it first')
    ).resolves.toBeUndefined()
  })

  it('throws a message naming the tool and the install hint when missing', async () => {
    which.mockResolvedValue('')
    await expect(requireOnPath('nf-test', 'install it first')).rejects.toThrow(
      'nf-test is not on PATH. install it first'
    )
  })
})

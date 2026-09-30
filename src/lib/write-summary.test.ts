import { describe, expect, it, jest } from '@jest/globals'

const write = jest.fn<() => Promise<void>>()
const warning = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
  summary: { write },
  warning
}))

const { writeSummaryBestEffort } = await import('./write-summary.js')

describe('writeSummaryBestEffort', () => {
  it('resolves normally when the summary writes', async () => {
    write.mockResolvedValue(undefined)
    await expect(writeSummaryBestEffort()).resolves.toBeUndefined()
    expect(warning).not.toHaveBeenCalled()
  })

  it('warns and does not throw when the summary fails to write, for example GITHUB_STEP_SUMMARY unset', async () => {
    write.mockRejectedValue(
      new Error('ENOENT: no such file or directory, open undefined')
    )
    await expect(writeSummaryBestEffort()).resolves.toBeUndefined()
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('ENOENT'))
  })
})

import { describe, expect, it, jest } from '@jest/globals'

const setFailed = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({ setFailed }))

const { runAction } = await import('./run-action.js')

describe('runAction', () => {
  it('does not fail the action when run succeeds', async () => {
    runAction(() => Promise.resolve())
    await new Promise((resolve) => setImmediate(resolve))
    expect(setFailed).not.toHaveBeenCalled()
  })

  it('fails the action with the Error message on a rejected promise', async () => {
    runAction(() => Promise.reject(new Error('boom')))
    await new Promise((resolve) => setImmediate(resolve))
    expect(setFailed).toHaveBeenCalledWith('boom')
  })

  it('stringifies a thrown non-Error value', async () => {
    runAction(() => Promise.reject('nope'))
    await new Promise((resolve) => setImmediate(resolve))
    expect(setFailed).toHaveBeenCalledWith('nope')
  })
})

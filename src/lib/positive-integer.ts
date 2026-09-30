/** Throws unless `value` is a positive integer. `label` names the value in the message. */
export function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `${label} must be a positive integer. Got: ${String(value)}`
    )
  }
}

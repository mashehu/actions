// Pure classification of a non-regular-file fs.Stats, for the "not a regular
// file" rejection message. A symlink is the case an uploaded artifact can
// actually contain (see validate-patch's run.ts), but every other
// non-regular type is named too, so the message is never a bare
// "unknown".

/** The subset of fs.Stats this needs. Lets a test build a fake without touching the filesystem. */
export interface StatLike {
  isSymbolicLink(): boolean
  isDirectory(): boolean
  isFIFO(): boolean
  isSocket(): boolean
  isBlockDevice(): boolean
  isCharacterDevice(): boolean
}

/** Names the type of a non-regular-file stat result, for an error message. */
export function describeType(stat: StatLike): string {
  if (stat.isSymbolicLink()) return 'a symlink'
  if (stat.isDirectory()) return 'a directory'
  if (stat.isFIFO()) return 'a FIFO'
  if (stat.isSocket()) return 'a socket'
  if (stat.isBlockDevice()) return 'a block device'
  if (stat.isCharacterDevice()) return 'a character device'
  return 'not a regular file'
}

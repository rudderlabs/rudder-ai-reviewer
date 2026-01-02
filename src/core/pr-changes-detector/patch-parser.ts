/**
 * Counts the number of hunks in a unified diff patch
 *
 * @param patch - Unified diff patch string from GitHub API
 */
export function countPatchHunks(patch: string): number {
  if (!patch || patch.trim() === '') {
    return 0;
  }

  // Regex: @@ -oldStart,oldCount +newStart,newCount @@
  const hunkHeaderRegex = /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@/gm;

  const matches = patch.match(hunkHeaderRegex);
  return matches ? matches.length : 0;
}

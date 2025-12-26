/**
 * Patch parsing utilities for GitHub diff patches
 */

/**
 * Counts the number of hunks in a unified diff patch
 *
 * Example patch with 2 hunks:
 * ```
 * @@ -10,5 +12,7 @@ function foo() {
 * -  old line
 * +  new line 1
 * @@ -50,2 +55,4 @@ function bar() {
 * +  new line 2
 * ```
 *
 * Returns: 2
 *
 * @param patch - Unified diff patch string from GitHub API
 * @returns Number of hunks in the patch
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

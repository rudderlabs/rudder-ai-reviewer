/**
 * Tests for patch parsing utilities
 */

import { countPatchHunks } from '../patch-parser';

describe('countPatchHunks', () => {
  it('should count single hunk in patch', () => {
    // Arrange
    const patch = `@@ -10,5 +12,7 @@ function foo() {
-  old line
+  new line 1
+  new line 2
   context line`;

    // Act
    const count = countPatchHunks(patch);

    // Assert
    expect(count).toBe(1);
  });

  it('should return 0 for missing patch', () => {
    // Act & Assert
    expect(countPatchHunks('')).toBe(0);
    expect(countPatchHunks('   ')).toBe(0);
  });

  it('should count multiple hunks in same patch', () => {
    // Arrange
    const patch = `@@ -10,3 +12,5 @@ function foo() {
+  line 1
+  line 2
@@ -50,2 +55,4 @@ function bar() {
+  line 3
+  line 4`;

    // Act
    const count = countPatchHunks(patch);

    // Assert
    expect(count).toBe(2);
  });

  it('should count hunk with single line (no count)', () => {
    // Arrange
    const patch = '@@ -5 +5 @@ export const foo';

    // Act
    const count = countPatchHunks(patch);

    // Assert
    expect(count).toBe(1);
  });
});

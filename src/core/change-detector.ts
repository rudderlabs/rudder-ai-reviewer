import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SDKMethodCall } from './file-scanner';
import { scanFilesForSDKUsage } from './file-scanner';

const execAsync = promisify(exec);

/**
 * Represents a change in SDK usage between branches
 */
export interface SDKChange {
  type: 'added' | 'removed' | 'modified';
  file: string;
  line: number;
  method: string;
  before?: SDKMethodCall;
  after?: SDKMethodCall;
  description: string;
}

/**
 * Result of comparing SDK usage between branches
 */
export interface ChangeDetectionResult {
  hasChanges: boolean;
  addedCalls: SDKMethodCall[];
  removedCalls: SDKMethodCall[];
  modifiedCalls: SDKChange[];
  unchangedCalls: SDKMethodCall[];
  isFirstTimeInstrumentation: boolean;
}

/**
 * Detects changes in SDK usage between base and head branches
 */
export async function detectSDKChanges(
  repoPath: string,
  baseBranch: string,
  headBranch: string
): Promise<ChangeDetectionResult> {
  core.info(`Detecting SDK changes between ${baseBranch} and ${headBranch}...`);

  // Scan head branch (current PR)
  const headCalls = await scanFilesForSDKUsage(repoPath);
  core.info(`Found ${headCalls.methodCalls.length} SDK calls in head branch`);

  // Check out base branch and scan
  const baseCalls = await scanBaseBranch(repoPath, baseBranch);
  core.info(`Found ${baseCalls.methodCalls.length} SDK calls in base branch`);

  // Determine if this is first-time instrumentation
  const isFirstTime = baseCalls.methodCalls.length === 0 && headCalls.methodCalls.length > 0;

  if (isFirstTime) {
    core.info('This appears to be first-time RudderStack instrumentation');
    return {
      hasChanges: true,
      addedCalls: headCalls.methodCalls,
      removedCalls: [],
      modifiedCalls: [],
      unchangedCalls: [],
      isFirstTimeInstrumentation: true,
    };
  }

  // Compare calls between branches
  const changes = compareSDKCalls(baseCalls.methodCalls, headCalls.methodCalls);

  core.info(
    `Changes detected: ${changes.addedCalls.length} added, ${changes.removedCalls.length} removed, ${changes.modifiedCalls.length} modified`
  );

  return {
    ...changes,
    isFirstTimeInstrumentation: false,
  };
}

/**
 * Scans base branch for SDK usage
 */
async function scanBaseBranch(repoPath: string, baseBranch: string) {
  const tempDir = path.join(repoPath, '.rudderstack-pr-reviewer-temp');

  try {
    // Create temporary directory for base branch checkout
    await fs.mkdir(tempDir, { recursive: true });

    // Use git worktree to check out base branch
    core.debug(`Creating git worktree for base branch at ${tempDir}`);
    await execAsync(`git worktree add "${tempDir}" "${baseBranch}"`, { cwd: repoPath });

    // Scan the base branch
    const baseCalls = await scanFilesForSDKUsage(tempDir);

    // Clean up worktree
    await execAsync(`git worktree remove "${tempDir}" --force`, { cwd: repoPath });

    return baseCalls;
  } catch (error) {
    core.warning(`Failed to scan base branch: ${error}`);

    // Clean up on error
    try {
      await execAsync(`git worktree remove "${tempDir}" --force`, { cwd: repoPath });
    } catch {
      // Ignore cleanup errors
    }

    // Return empty result
    return {
      totalFilesScanned: 0,
      filesWithSDK: 0,
      methodCalls: [],
    };
  }
}

/**
 * Compares SDK calls between two branches
 */
function compareSDKCalls(
  baseCalls: SDKMethodCall[],
  headCalls: SDKMethodCall[]
): {
  hasChanges: boolean;
  addedCalls: SDKMethodCall[];
  removedCalls: SDKMethodCall[];
  modifiedCalls: SDKChange[];
  unchangedCalls: SDKMethodCall[];
} {
  const added: SDKMethodCall[] = [];
  const removed: SDKMethodCall[] = [];
  const modified: SDKChange[] = [];
  const unchanged: SDKMethodCall[] = [];

  // Create lookup maps for efficient comparison
  const baseMap = createCallMap(baseCalls);
  const headMap = createCallMap(headCalls);

  // Find added and modified calls
  for (const headCall of headCalls) {
    const key = getCallKey(headCall);
    const baseCall = baseMap.get(key);

    if (!baseCall) {
      // New call
      added.push(headCall);
    } else {
      // Check if modified
      const change = detectModification(baseCall, headCall);
      if (change) {
        modified.push(change);
      } else {
        unchanged.push(headCall);
      }
    }
  }

  // Find removed calls
  for (const baseCall of baseCalls) {
    const key = getCallKey(baseCall);
    if (!headMap.has(key)) {
      removed.push(baseCall);
    }
  }

  return {
    hasChanges: added.length > 0 || removed.length > 0 || modified.length > 0,
    addedCalls: added,
    removedCalls: removed,
    modifiedCalls: modified,
    unchangedCalls: unchanged,
  };
}

/**
 * Creates a map of SDK calls for efficient lookup
 */
function createCallMap(calls: SDKMethodCall[]): Map<string, SDKMethodCall> {
  const map = new Map<string, SDKMethodCall>();
  for (const call of calls) {
    const key = getCallKey(call);
    map.set(key, call);
  }
  return map;
}

/**
 * Generates a unique key for an SDK call (file:line:method)
 */
function getCallKey(call: SDKMethodCall): string {
  // Make file path relative to repo root for comparison
  const relativePath = call.file.split('/').slice(-3).join('/'); // Last 3 path segments
  return `${relativePath}:${call.line}:${call.method}`;
}

/**
 * Detects if a call has been modified between branches
 */
function detectModification(baseCall: SDKMethodCall, headCall: SDKMethodCall): SDKChange | null {
  const changes: string[] = [];

  // Compare argument count
  if (baseCall.arguments.length !== headCall.arguments.length) {
    changes.push(`Argument count changed from ${baseCall.arguments.length} to ${headCall.arguments.length}`);
  }

  // Compare argument values (only for static arguments)
  for (let i = 0; i < Math.min(baseCall.arguments.length, headCall.arguments.length); i++) {
    const baseArg = baseCall.arguments[i];
    const headArg = headCall.arguments[i];

    if (baseArg.isStatic && headArg.isStatic) {
      // Compare types
      if (baseArg.type !== headArg.type) {
        changes.push(`Argument ${i + 1} type changed from ${baseArg.type} to ${headArg.type}`);
      }

      // Compare values for primitives
      if (baseArg.type === headArg.type && ['string', 'number', 'boolean'].includes(baseArg.type)) {
        if (baseArg.value !== headArg.value) {
          changes.push(`Argument ${i + 1} value changed from ${JSON.stringify(baseArg.value)} to ${JSON.stringify(headArg.value)}`);
        }
      }

      // Compare object properties
      if (baseArg.type === 'object' && headArg.type === 'object') {
        const objChanges = compareObjects(baseArg.value, headArg.value);
        if (objChanges.length > 0) {
          changes.push(...objChanges.map((c) => `Argument ${i + 1}: ${c}`));
        }
      }
    }
  }

  // If no changes detected, return null
  if (changes.length === 0) {
    return null;
  }

  return {
    type: 'modified',
    file: headCall.file,
    line: headCall.line,
    method: headCall.method,
    before: baseCall,
    after: headCall,
    description: changes.join('; '),
  };
}

/**
 * Compares two objects and returns list of changes
 */
function compareObjects(baseObj: unknown, headObj: unknown): string[] {
  const changes: string[] = [];

  if (typeof baseObj !== 'object' || baseObj === null || typeof headObj !== 'object' || headObj === null) {
    return changes;
  }

  const baseKeys = new Set(Object.keys(baseObj as Record<string, unknown>));
  const headKeys = new Set(Object.keys(headObj as Record<string, unknown>));

  // Find added properties
  for (const key of headKeys) {
    if (!baseKeys.has(key)) {
      changes.push(`Added property '${key}'`);
    }
  }

  // Find removed properties
  for (const key of baseKeys) {
    if (!headKeys.has(key)) {
      changes.push(`Removed property '${key}'`);
    }
  }

  // Find modified properties
  for (const key of baseKeys) {
    if (headKeys.has(key)) {
      const baseVal = (baseObj as Record<string, unknown>)[key];
      const headVal = (headObj as Record<string, unknown>)[key];

      // Compare primitives
      if (typeof baseVal !== 'object' && typeof headVal !== 'object') {
        if (baseVal !== headVal) {
          changes.push(`Property '${key}' changed from ${JSON.stringify(baseVal)} to ${JSON.stringify(headVal)}`);
        }
      }

      // Compare types
      if (typeof baseVal !== typeof headVal) {
        changes.push(`Property '${key}' type changed from ${typeof baseVal} to ${typeof headVal}`);
      }
    }
  }

  return changes;
}

/**
 * Gets list of changed files in PR
 */
export async function getChangedFiles(repoPath: string, baseBranch: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(`git diff --name-only ${baseBranch}...HEAD`, { cwd: repoPath });
    return stdout
      .trim()
      .split('\n')
      .filter((f) => f.length > 0);
  } catch (error) {
    core.warning(`Failed to get changed files: ${error}`);
    return [];
  }
}

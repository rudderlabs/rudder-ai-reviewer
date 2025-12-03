/**
 * GitHub Artifacts Manager
 * Manages artifact storage and retrieval for incremental analysis
 */

import artifactClient from '@actions/artifact';
import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AnalysisArtifact } from '../../types/common';
import { AIAnalysisResult } from '../anthropic/types';

const ARTIFACT_NAME = 'rudderstack-pr-analysis';
const ARTIFACT_FILE = 'analysis-result.json';

/**
 * Store analysis result as artifact
 */
export async function storeAnalysisArtifact(
  prNumber: number,
  commitSha: string,
  result: AIAnalysisResult
): Promise<boolean> {
  try {
    core.info('Storing analysis result as artifact...');

    const analysisArtifact: AnalysisArtifact = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      prNumber,
      commitSha,
      analysisResult: result,
    };

    // Create temporary directory for artifact
    const tempDir = path.join(process.cwd(), '.artifact-temp');
    await fs.mkdir(tempDir, { recursive: true });

    const artifactPath = path.join(tempDir, ARTIFACT_FILE);

    // Write artifact file
    await fs.writeFile(artifactPath, JSON.stringify(analysisArtifact, null, 2), 'utf-8');

    // Upload artifact
    const uploadResult = await artifactClient.uploadArtifact(
      ARTIFACT_NAME,
      [artifactPath],
      tempDir,
      {
        retentionDays: 90, // Artifacts survive 90 days
      }
    );

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });

    if (!uploadResult.id) {
      core.warning('Artifact upload did not return an ID');
      return false;
    }

    core.info(`✅ Analysis artifact stored (${uploadResult.size || 0} bytes)`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to store analysis artifact: ${message}`);
    return false;
  }
}

/**
 * Retrieve previous analysis result from artifact
 */
export async function retrieveAnalysisArtifact(
  prNumber: number
): Promise<AnalysisArtifact | null> {
  try {
    core.info('Retrieving previous analysis artifact...');

    const tempDir = path.join(process.cwd(), '.artifact-temp');
    await fs.mkdir(tempDir, { recursive: true });

    // First, get the artifact to find its ID
    const getResult = await artifactClient.getArtifact(ARTIFACT_NAME);

    if (!getResult || !getResult.artifact) {
      core.info('No previous artifact found');
      return null;
    }

    // Download artifact using its ID
    const downloadResult = await artifactClient.downloadArtifact(getResult.artifact.id, { path: tempDir });

    // Read artifact file
    const artifactPath = path.join(tempDir, ARTIFACT_FILE);

    try {
      const content = await fs.readFile(artifactPath, 'utf-8');
      const analysisArtifact: AnalysisArtifact = JSON.parse(content);

      // Validate artifact is for the same PR
      if (analysisArtifact.prNumber !== prNumber) {
        core.warning(`Artifact is for PR #${analysisArtifact.prNumber}, expected #${prNumber}`);
        return null;
      }

      core.info(`✅ Retrieved analysis artifact from ${analysisArtifact.timestamp}`);

      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true });

      return analysisArtifact;
    } catch (error) {
      core.warning('Failed to parse artifact file');
      return null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.debug(`Failed to retrieve analysis artifact: ${message}`);
    return null; // Not an error - might be first run
  }
}

/**
 * Check if incremental analysis is needed
 */
export function shouldPerformIncrementalAnalysis(
  previousArtifact: AnalysisArtifact | null,
  currentCommitSha: string
): boolean {
  if (!previousArtifact) {
    core.info('No previous artifact found, performing full analysis');
    return false;
  }

  if (previousArtifact.commitSha === currentCommitSha) {
    core.info('Commit SHA matches previous analysis, skipping re-analysis');
    return false;
  }

  core.info(
    `Previous analysis was for commit ${previousArtifact.commitSha.substring(0, 7)}, performing incremental analysis`
  );
  return true;
}

/**
 * Delete analysis artifact
 */
export async function deleteAnalysisArtifact(): Promise<boolean> {
  try {
    core.info('Deleting analysis artifact...');

    // Note: GitHub Actions doesn't provide a direct API to delete artifacts
    // Artifacts will auto-expire after retention period (90 days)
    core.info('Artifact will expire after retention period');

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`Failed to delete analysis artifact: ${message}`);
    return false;
  }
}

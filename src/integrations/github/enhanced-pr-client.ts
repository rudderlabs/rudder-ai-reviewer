/**
 * Enhanced GitHub PR Client
 * Handles PR comments, annotations, and updates
 */

import * as github from '@actions/github';
import * as core from '@actions/core';
import { PRContext, PRComment, PRAnnotation } from '../../types/common';

const COMMENT_IDENTIFIER = '<!-- rudderstack-pr-reviewer-analysis -->';

/**
 * Get PR context from GitHub environment
 */
export function getPRContext(): PRContext | null {
  const context = github.context;

  if (!context.payload.pull_request) {
    core.warning('Not running in a pull request context');
    return null;
  }

  const pr = context.payload.pull_request;

  return {
    owner: context.repo.owner,
    repo: context.repo.repo,
    prNumber: pr.number,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    changedFiles: [],
  };
}

/**
 * Get changed files in PR
 */
export async function getChangedFiles(
  prContext: PRContext,
  token: string
): Promise<string[]> {
  try {
    const octokit = github.getOctokit(token);

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: prContext.owner,
      repo: prContext.repo,
      pull_number: prContext.prNumber,
    });

    return files.map((f) => f.filename);
  } catch (error) {
    core.warning(`Failed to get changed files: ${error}`);
    return [];
  }
}

/**
 * Post or update PR comment
 */
export async function postOrUpdateComment(
  prContext: PRContext,
  token: string,
  commentBody: string
): Promise<boolean> {
  try {
    const octokit = github.getOctokit(token);
    const fullCommentBody = `${COMMENT_IDENTIFIER}\n${commentBody}`;

    // Find existing comment
    const { data: comments } = await octokit.rest.issues.listComments({
      owner: prContext.owner,
      repo: prContext.repo,
      issue_number: prContext.prNumber,
    });

    const existingComment = comments.find((comment) =>
      comment.body?.includes(COMMENT_IDENTIFIER)
    );

    if (existingComment) {
      // Update existing comment
      core.info(`Updating existing comment #${existingComment.id}`);
      await octokit.rest.issues.updateComment({
        owner: prContext.owner,
        repo: prContext.repo,
        comment_id: existingComment.id,
        body: fullCommentBody,
      });
    } else {
      // Create new comment
      core.info('Creating new PR comment');
      await octokit.rest.issues.createComment({
        owner: prContext.owner,
        repo: prContext.repo,
        issue_number: prContext.prNumber,
        body: fullCommentBody,
      });
    }

    core.info('✅ Successfully posted/updated PR comment');
    return true;
  } catch (error) {
    core.warning(`Failed to post comment: ${error}`);
    return false;
  }
}

/**
 * Post inline annotations (via check run)
 */
export async function postAnnotations(
  prContext: PRContext,
  token: string,
  annotations: PRAnnotation[],
  conclusion: 'success' | 'failure' | 'neutral' = 'neutral'
): Promise<boolean> {
  try {
    if (annotations.length === 0) {
      core.info('No annotations to post');
      return true;
    }

    const octokit = github.getOctokit(token);

    // Create check run
    const checkName = 'RudderStack Instrumentation Review';

    const { data: checkRun } = await octokit.rest.checks.create({
      owner: prContext.owner,
      repo: prContext.repo,
      name: checkName,
      head_sha: prContext.headSha,
      status: 'completed',
      conclusion,
      output: {
        title: 'RudderStack SDK Analysis',
        summary: `Found ${annotations.length} issue(s) in RudderStack instrumentation`,
        annotations: annotations.slice(0, 50).map((ann) => ({
          path: ann.path,
          start_line: ann.startLine,
          end_line: ann.endLine,
          annotation_level: ann.annotationLevel,
          message: ann.message,
          title: ann.title,
        })),
      },
    });

    core.info(`✅ Posted ${annotations.length} annotations via check run #${checkRun.id}`);

    // If more than 50 annotations, post them in batches
    if (annotations.length > 50) {
      const remaining = annotations.slice(50);
      for (let i = 0; i < remaining.length; i += 50) {
        const batch = remaining.slice(i, i + 50);

        await octokit.rest.checks.update({
          owner: prContext.owner,
          repo: prContext.repo,
          check_run_id: checkRun.id,
          output: {
            title: 'RudderStack SDK Analysis',
            summary: `Found ${annotations.length} issue(s) in RudderStack instrumentation`,
            annotations: batch.map((ann) => ({
              path: ann.path,
              start_line: ann.startLine,
              end_line: ann.endLine,
              annotation_level: ann.annotationLevel,
              message: ann.message,
              title: ann.title,
            })),
          },
        });
      }
    }

    return true;
  } catch (error) {
    core.warning(`Failed to post annotations: ${error}`);
    return false;
  }
}

/**
 * Delete previous comments
 */
export async function deletePreviousComments(
  prContext: PRContext,
  token: string
): Promise<boolean> {
  try {
    const octokit = github.getOctokit(token);

    const { data: comments } = await octokit.rest.issues.listComments({
      owner: prContext.owner,
      repo: prContext.repo,
      issue_number: prContext.prNumber,
    });

    const ourComments = comments.filter((comment) =>
      comment.body?.includes(COMMENT_IDENTIFIER)
    );

    for (const comment of ourComments) {
      await octokit.rest.issues.deleteComment({
        owner: prContext.owner,
        repo: prContext.repo,
        comment_id: comment.id,
      });

      core.info(`Deleted comment #${comment.id}`);
    }

    return true;
  } catch (error) {
    core.warning(`Failed to delete previous comments: ${error}`);
    return false;
  }
}

/**
 * Set output variables
 */
export function setOutputs(result: {
  status: string;
  errorCount: number;
  warningCount: number;
  suggestionCount: number;
}): void {
  core.setOutput('analysis_status', result.status);
  core.setOutput('error_count', result.errorCount);
  core.setOutput('warning_count', result.warningCount);
  core.setOutput('suggestion_count', result.suggestionCount);
}

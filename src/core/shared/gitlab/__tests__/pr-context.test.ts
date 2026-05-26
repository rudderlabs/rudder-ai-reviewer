import { NotPullRequestContextError } from '@core/shared/errors';
import { extractGitLabMergeRequestContext } from '../pr-context';

describe('extractGitLabMergeRequestContext', () => {
  it('extracts merge request context from GitLab CI env', () => {
    const result = extractGitLabMergeRequestContext({
      CI_PROJECT_PATH: 'group/subgroup/project',
      CI_MERGE_REQUEST_IID: '42',
    });

    expect(result).toEqual({
      projectPath: 'group/subgroup/project',
      mergeRequestIid: 42,
    });
  });

  it('throws when merge request iid is missing', () => {
    expect(() =>
      extractGitLabMergeRequestContext({
        CI_PROJECT_PATH: 'group/project',
      })
    ).toThrow(NotPullRequestContextError);
  });

  it('throws when project path is missing', () => {
    expect(() =>
      extractGitLabMergeRequestContext({
        CI_MERGE_REQUEST_IID: '99',
      })
    ).toThrow(NotPullRequestContextError);
  });
});

import { detectProviderIdFromEnvironment, isGitLabMergeRequestEnvironment } from '../environment';

describe('provider environment detection', () => {
  it('detects GitLab merge request environment when required vars are present', () => {
    const env = {
      CI_MERGE_REQUEST_IID: '12',
      CI_PROJECT_PATH: 'group/project',
    } as NodeJS.ProcessEnv;

    expect(isGitLabMergeRequestEnvironment(env)).toBe(true);
    expect(detectProviderIdFromEnvironment(env)).toBe('gitlab');
  });

  it('detects github provider when GitLab vars are missing', () => {
    const env = {} as NodeJS.ProcessEnv;

    expect(isGitLabMergeRequestEnvironment(env)).toBe(false);
    expect(detectProviderIdFromEnvironment(env)).toBe('github');
  });

  it('detects github provider when only one GitLab var is present', () => {
    const env = {
      CI_MERGE_REQUEST_IID: '12',
    } as NodeJS.ProcessEnv;

    expect(isGitLabMergeRequestEnvironment(env)).toBe(false);
    expect(detectProviderIdFromEnvironment(env)).toBe('github');
  });
});

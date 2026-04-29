import type { ChangeRequestContext, SCMProvider } from '@core/providers';
import { detectPRChanges } from '../index';

jest.mock('../pr-changes-detector');

import { PRChangesDetector } from '../pr-changes-detector';

describe('detectPRChanges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create detector with proper dependencies and return result', async () => {
    const prContext: ChangeRequestContext = {
      provider: 'github',
      owner: 'test-owner',
      repo: 'test-repo',
      number: 123,
    };

    const mockResult = {
      pull_request: {
        number: 123,
        title: 'Test PR',
        head_sha: 'abc123',
        base_sha: 'def456',
        head_ref: 'feature',
        base_ref: 'main',
        files_changed_count: 1,
        lines_added: 10,
        lines_deleted: 5,
        lines_changed: 15,
      },
      diff_context: [],
    };

    const mockProvider = {} as SCMProvider;

    const mockDetector = {
      detect: jest.fn().mockResolvedValue(mockResult),
    };
    (PRChangesDetector as jest.Mock).mockImplementation(() => mockDetector);

    const result = await detectPRChanges(mockProvider, prContext);

    expect(PRChangesDetector).toHaveBeenCalledWith(mockProvider);
    expect(mockDetector.detect).toHaveBeenCalledWith(prContext, '.');
    expect(result).toEqual(mockResult);
  });
});

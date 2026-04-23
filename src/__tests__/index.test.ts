const mockInfo = jest.fn();
const mockWarning = jest.fn();
const mockSetOutput = jest.fn();
const mockSetFailed = jest.fn();
const mockError = jest.fn();
const mockDebug = jest.fn();

const mockPostReview = jest.fn();
const mockDetectPRChanges = jest.fn();
const mockDetectSDK = jest.fn();
const mockDetectFrameworks = jest.fn();
const mockBuildReviewPayload = jest.fn();
const mockPostAIReviewerComments = jest.fn();

jest.mock('@actions/core', () => ({
  info: mockInfo,
  warning: mockWarning,
  setOutput: mockSetOutput,
  setFailed: mockSetFailed,
  error: mockError,
  debug: mockDebug,
}));

jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'rudderlabs',
      repo: 'rudder-ai-reviewer',
    },
    payload: {
      pull_request: {
        number: 62,
      },
    },
  },
}));

jest.mock('@clients/pr-reviewer-service.client', () => ({
  PRReviewerServiceClient: jest.fn().mockImplementation(() => ({
    postReview: mockPostReview,
  })),
}));

jest.mock('@core/pr-changes-detector', () => ({
  detectPRChanges: mockDetectPRChanges,
}));

jest.mock('@core/sdk-detector', () => ({
  detectSDK: mockDetectSDK,
}));

jest.mock('@core/framework-detector', () => ({
  detectFrameworks: mockDetectFrameworks,
}));

jest.mock('@core/review-payload-builder', () => ({
  buildReviewPayload: mockBuildReviewPayload,
}));

jest.mock('@core/review-commenter', () => ({
  postAIReviewerComments: mockPostAIReviewerComments,
}));

async function flushAsyncWork(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve));
}

describe('action entrypoint', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('skips review service when no relevant changed files are detected', async () => {
    mockDetectPRChanges.mockResolvedValue({
      pull_request: {
        number: 62,
        title: 'Test PR',
        head_sha: 'head',
        base_sha: 'base',
        head_ref: 'feature',
        base_ref: 'main',
        files_changed_count: 0,
        lines_added: 0,
        lines_deleted: 0,
        lines_changed: 0,
      },
      diff_context: [],
    });

    await import('../index');
    await flushAsyncWork();

    expect(mockDetectPRChanges).toHaveBeenCalledTimes(1);
    expect(mockDetectSDK).not.toHaveBeenCalled();
    expect(mockDetectFrameworks).not.toHaveBeenCalled();
    expect(mockBuildReviewPayload).not.toHaveBeenCalled();
    expect(mockPostReview).not.toHaveBeenCalled();
    expect(mockPostAIReviewerComments).not.toHaveBeenCalled();

    expect(mockSetOutput).toHaveBeenCalledWith('status', 'success');
    expect(mockSetOutput).toHaveBeenCalledWith(
      'message',
      'No relevant source file changes detected; skipped review'
    );
    expect(mockSetFailed).not.toHaveBeenCalled();
  });
});

export class NotPullRequestContextError extends Error {
  constructor() {
    super('Not running in pull request or merge request context');
    this.name = 'NotPullRequestContextError';
  }
}

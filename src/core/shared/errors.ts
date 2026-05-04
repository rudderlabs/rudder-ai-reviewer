export class NotPullRequestContextError extends Error {
  constructor() {
    super('Not running in pull request context');
    this.name = 'NotPullRequestContextError';
  }
}

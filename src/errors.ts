/**
 * Diver refused a call. `message` is the server's own sentence, which says
 * what to fix: a key for another app, a campaign that has not been sent, a
 * token entry the server would not take.
 */
export class DiverPushError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'DiverPushError';
    this.statusCode = statusCode;
  }
}

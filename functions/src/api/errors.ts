export class WakeApiServerError extends Error {
  retryAfter?: number;

  constructor(
    public code: string,
    public status: number,
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = "WakeApiServerError";
  }
}

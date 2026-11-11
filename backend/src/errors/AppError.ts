export interface FieldIssue { field: string; message: string; }

export class AppError extends Error {
  constructor(public readonly statusCode: number, message: string, public readonly details?: FieldIssue[]) {
    super(message);
    this.name = "AppError";
  }
}

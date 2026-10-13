import { apiErrorSchema } from "../../contracts/index.ts";
import { ZodError } from "zod";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return Response.json(data, { ...init, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json(
      apiErrorSchema.parse({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      }),
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return json(
      {
        error: {
          code: "validation_error",
          message: "The request was invalid.",
          details: error.issues,
        },
      },
      { status: 400 },
    );
  }
  console.error(error);
  return json(
    {
      error: { code: "internal_error", message: "An internal error occurred." },
    },
    { status: 500 },
  );
}

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Expected a JSON request body.");
  }
}

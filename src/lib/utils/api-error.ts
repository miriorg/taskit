export class ApiRouteError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

export class ConflictError extends ApiRouteError {
  constructor(message = "The data was updated elsewhere. Reload and try again.") {
    super(message, 409, "conflict");
  }
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiRouteError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  const isConflict = typeof message === "string" && message.toLowerCase().includes("conflict");
  const status = message === "Unauthorized" ? 401 : isConflict ? 409 : 500;
  const code = message === "Unauthorized" ? "unauthorized" : isConflict ? "conflict" : "internal_error";

  return Response.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export class ApiRouteError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
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
  const status = message === "Unauthorized" ? 401 : 500;
  const code = message === "Unauthorized" ? "unauthorized" : "internal_error";

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

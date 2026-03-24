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

function mapKnownError(message: string): { status: number; code: string; message: string } | null {
  const knownErrors: Array<{ match: (message: string) => boolean; status: number; code: string; message: string }> = [
    {
      match: (value) => value === "Unauthorized",
      status: 401,
      code: "unauthorized",
      message: "ログイン状態を確認してください。必要に応じて再度サインインしてください。",
    },
    {
      match: (value) => value.includes("updated elsewhere") || value.toLowerCase().includes("conflict"),
      status: 409,
      code: "conflict",
      message: "他の画面で更新されたため保存できませんでした。最新データを読み込んでから再度お試しください。",
    },
    {
      match: (value) => value === "Task not found",
      status: 404,
      code: "not_found",
      message: "対象のタスクが見つかりません。最新データを読み込んで確認してください。",
    },
    {
      match: (value) => value === "Project not found",
      status: 404,
      code: "not_found",
      message: "対象のプロジェクトが見つかりません。最新データを読み込んで確認してください。",
    },
    {
      match: (value) => value === "Parent project not found",
      status: 404,
      code: "not_found",
      message: "親プロジェクトが見つかりません。最新データを読み込んで確認してください。",
    },
    {
      match: (value) => value === "Tag not found",
      status: 404,
      code: "not_found",
      message: "指定したタグが見つかりません。最新データを読み込んで確認してください。",
    },
    {
      match: (value) => value === "View not found",
      status: 404,
      code: "not_found",
      message: "保存ビューが見つかりません。最新データを読み込んで確認してください。",
    },
    {
      match: (value) => value === "Tag name already exists",
      status: 422,
      code: "validation_error",
      message: "同じ名前のタグがすでに存在します。別の名前を入力してください。",
    },
    {
      match: (value) => value === "System project cannot be renamed",
      status: 403,
      code: "forbidden",
      message: "固定プロジェクトの名前は変更できません。",
    },
    {
      match: (value) => value === "System project parent cannot be changed",
      status: 403,
      code: "forbidden",
      message: "固定プロジェクトの親プロジェクトは変更できません。",
    },
    {
      match: (value) => value === "System project cannot be deleted",
      status: 403,
      code: "forbidden",
      message: "固定プロジェクトは削除できません。",
    },
    {
      match: (value) => value === "System project cannot be a parent",
      status: 422,
      code: "validation_error",
      message: "固定プロジェクトは親プロジェクトに指定できません。",
    },
    {
      match: (value) => value === "Project cannot be its own parent",
      status: 422,
      code: "validation_error",
      message: "同じプロジェクトを親に指定することはできません。",
    },
    {
      match: (value) => value === "Project cannot move under its descendant",
      status: 422,
      code: "validation_error",
      message: "子孫プロジェクトを親に指定することはできません。",
    },
    {
      match: (value) => value === "Google Drive access token is missing",
      status: 401,
      code: "unauthorized",
      message: "Google Drive への接続情報が無効です。再度サインインしてください。",
    },
    {
      match: (value) => value.includes("master is not initialized"),
      status: 500,
      code: "drive_error",
      message: "データの初期化状態を確認できませんでした。少し待ってからもう一度お試しください。",
    },
    {
      match: (value) => value.startsWith("Google Drive") && value.includes("failed"),
      status: 502,
      code: "drive_error",
      message: "Google Drive への保存または読み込みに失敗しました。少し待ってから再度お試しください。",
    },
  ];

  return knownErrors.find((item) => item.match(message)) ?? null;
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof ApiRouteError) {
    const mapped = mapKnownError(error.message);

    return Response.json(
      {
        error: {
          code: mapped?.code ?? error.code,
          message: mapped?.message ?? error.message,
        },
      },
      { status: mapped?.status ?? error.status },
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  const mapped = typeof message === "string" ? mapKnownError(message) : null;

  return Response.json(
    {
      error: {
        code: mapped?.code ?? "internal_error",
        message: mapped?.message ?? message,
      },
    },
    { status: mapped?.status ?? 500 },
  );
}

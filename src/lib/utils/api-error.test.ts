import { describe, expect, it } from "vitest";

import { ApiRouteError, toErrorResponse } from "./api-error";

describe("toErrorResponse", () => {
  it("maps known not found errors to user-friendly messages", async () => {
    const response = toErrorResponse(new Error("Tag not found"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toBe("指定したタグが見つかりません。最新データを読み込んで確認してください。");
  });

  it("maps system project restrictions to forbidden responses", async () => {
    const response = toErrorResponse(new Error("System project cannot be deleted"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toBe("固定プロジェクトは削除できません。");
  });

  it("translates ApiRouteError messages too", async () => {
    const response = toErrorResponse(new ApiRouteError("Task not found", 404, "not_found"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toBe("対象のタスクが見つかりません。最新データを読み込んで確認してください。");
  });
});

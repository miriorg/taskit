import { describe, expect, it } from "vitest";

import type { ProjectMasterFile } from "@/types";
import { DONE_PROJECT_ID, INBOX_PROJECT_ID } from "@/lib/utils/system-projects";

import { ProjectService } from "./project-service";

class ProjectRepositoryStub {
  constructor(private master: ProjectMasterFile) {}

  async getMaster() {
    return this.master;
  }

  async save(master: ProjectMasterFile) {
    this.master = master;
    return master;
  }
}

class TaskRepositoryStub {
  async deleteByProjectId() {
    return;
  }
}

function createMaster(): ProjectMasterFile {
  return {
    schema_version: 1,
    updated_at: "2026-03-22T00:00:00.000Z",
    projects: [
      {
        id: INBOX_PROJECT_ID,
        name: "Inbox",
        color: "#8899aa",
        parent_id: null,
        system: true,
        created_at: "2026-03-22T00:00:00.000Z",
        updated_at: "2026-03-22T00:00:00.000Z",
      },
      {
        id: DONE_PROJECT_ID,
        name: "Done",
        color: "#556677",
        parent_id: null,
        system: true,
        created_at: "2026-03-22T00:00:00.000Z",
        updated_at: "2026-03-22T00:00:00.000Z",
      },
      {
        id: "proj-parent",
        name: "Parent",
        color: "#336699",
        parent_id: null,
        system: false,
        created_at: "2026-03-22T00:00:00.000Z",
        updated_at: "2026-03-22T00:00:00.000Z",
      },
      {
        id: "proj-child",
        name: "Child",
        color: "#336699",
        parent_id: "proj-parent",
        system: false,
        created_at: "2026-03-22T00:00:00.000Z",
        updated_at: "2026-03-22T00:00:00.000Z",
      },
    ],
  };
}

describe("ProjectService", () => {
  it("rejects system projects as parent targets", async () => {
    const service = new ProjectService(
      new ProjectRepositoryStub(createMaster()) as never,
      new TaskRepositoryStub() as never,
    );

    await expect(service.create({ name: "Nested inbox", color: "#ffffff", parent_id: INBOX_PROJECT_ID })).rejects.toThrow(
      "System project cannot be a parent",
    );
  });

  it("rejects moving a project under its descendant", async () => {
    const service = new ProjectService(
      new ProjectRepositoryStub(createMaster()) as never,
      new TaskRepositoryStub() as never,
    );

    await expect(service.update("proj-parent", { parent_id: "proj-child" })).rejects.toThrow(
      "Project cannot move under its descendant",
    );
  });
});

import { describe, expect, it } from "vitest";

import { DONE_PROJECT_ID, INBOX_PROJECT_ID } from "@/lib/utils/system-projects";
import type { ProjectMasterFile, TagMasterFile, TaskFile, ViewMasterFile } from "@/types";

import {
  BootstrapService,
  createInitialProjectMasterFile,
  createInitialTagMasterFile,
  createInitialViewMasterFile,
} from "./bootstrap-service";

class ProjectRepositoryStub {
  constructor(private master: ProjectMasterFile | null = null) {}

  async getMaster() {
    return this.master;
  }

  async save(master: ProjectMasterFile) {
    this.master = master;
    return master;
  }
}

class TagRepositoryStub {
  constructor(private master: TagMasterFile | null = null) {}

  async getMaster() {
    return this.master;
  }

  async save(master: TagMasterFile) {
    this.master = master;
    return master;
  }
}

class ViewRepositoryStub {
  constructor(private master: ViewMasterFile | null = null) {}

  async getMaster() {
    return this.master;
  }

  async save(master: ViewMasterFile) {
    this.master = master;
    return master;
  }
}

class TaskRepositoryStub {
  private files = new Map<string, TaskFile>();

  constructor(files: TaskFile[] = []) {
    files.forEach((file) => this.files.set(file.project_id, file));
  }

  async getByProjectId(projectId: string) {
    return this.files.get(projectId) ?? {
      schema_version: 1,
      updated_at: "2026-03-21T00:00:00.000Z",
      project_id: projectId,
      tasks: [],
    };
  }

  async save(taskFile: TaskFile) {
    this.files.set(taskFile.project_id, taskFile);
    return taskFile;
  }
}

describe("createInitialProjectMasterFile", () => {
  it("creates the fixed inbox and done projects", () => {
    const now = "2026-03-21T00:00:00.000Z";
    const projectMaster = createInitialProjectMasterFile(now);

    expect(projectMaster.projects.map((project) => project.id)).toEqual([INBOX_PROJECT_ID, DONE_PROJECT_ID]);
    expect(projectMaster.projects.every((project) => project.system)).toBe(true);
  });
});

describe("createInitialTagMasterFile", () => {
  it("creates an empty tag master", () => {
    expect(createInitialTagMasterFile("2026-03-21T00:00:00.000Z")).toEqual({
      schema_version: 1,
      updated_at: "2026-03-21T00:00:00.000Z",
      tags: [],
    });
  });
});

describe("createInitialViewMasterFile", () => {
  it("creates an empty view master", () => {
    expect(createInitialViewMasterFile("2026-03-21T00:00:00.000Z")).toEqual({
      schema_version: 1,
      updated_at: "2026-03-21T00:00:00.000Z",
      views: [],
    });
  });
});

describe("BootstrapService", () => {
  it("creates missing master files and system task files", async () => {
    const service = new BootstrapService(
      new ProjectRepositoryStub(),
      new TagRepositoryStub(),
      new ViewRepositoryStub(),
      new TaskRepositoryStub(),
    );

    const result = await service.execute();

    expect(result.success).toBe(true);
    expect(result.created).toEqual([
      "project.json",
      "tag.json",
      "view.json",
      `task-${INBOX_PROJECT_ID}.json`,
      `task-${DONE_PROJECT_ID}.json`,
    ]);
  });

  it("does not recreate files that already exist", async () => {
    const service = new BootstrapService(
      new ProjectRepositoryStub(createInitialProjectMasterFile("2026-03-21T00:00:00.000Z")),
      new TagRepositoryStub(createInitialTagMasterFile("2026-03-21T00:00:00.000Z")),
      new ViewRepositoryStub(createInitialViewMasterFile("2026-03-21T00:00:00.000Z")),
      new TaskRepositoryStub([
        {
          schema_version: 1,
          updated_at: "2026-03-21T00:00:00.000Z",
          revision: "rev-1",
          project_id: INBOX_PROJECT_ID,
          tasks: [],
        },
        {
          schema_version: 1,
          updated_at: "2026-03-21T00:00:00.000Z",
          revision: "rev-2",
          project_id: DONE_PROJECT_ID,
          tasks: [],
        },
      ]),
    );

    const result = await service.execute();

    expect(result.created).toEqual([]);
  });
});

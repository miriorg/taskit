import { describe, expect, it } from "vitest";

import type { ProjectMasterFile, TagMasterFile, TaskFile } from "@/types";

import { TestDataService } from "./test-data-service";

class ProjectRepositoryStub {
  constructor(private readonly master: ProjectMasterFile | null) {}

  async getMaster() {
    return this.master;
  }
}

class TagRepositoryStub {
  constructor(private readonly master: TagMasterFile | null) {}

  async getMaster() {
    return this.master;
  }
}

class TaskRepositoryStub {
  savedTaskFile: TaskFile | null = null;

  constructor(private readonly taskFile: TaskFile) {}

  async getByProjectId() {
    return this.taskFile;
  }

  async save(taskFile: TaskFile) {
    this.savedTaskFile = taskFile;
    return taskFile;
  }
}

describe("TestDataService", () => {
  it("creates the requested number of tasks with unique titles", async () => {
    const taskRepository = new TaskRepositoryStub({
      schema_version: 1,
      updated_at: "2026-03-22T00:00:00.000Z",
      project_id: "proj-1",
      tasks: [
        {
          id: "task-existing",
          project_id: "proj-1",
          title: "Review weekly roadmap 01",
          description: null,
          due_date: null,
          priority: null,
          status: "todo",
          tag_ids: [],
          reminders: [],
          created_at: "2026-03-22T00:00:00.000Z",
          updated_at: "2026-03-22T00:00:00.000Z",
          completed_at: null,
        },
      ],
    });
    const service = new TestDataService(
      new ProjectRepositoryStub({
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        projects: [
          {
            id: "proj-1",
            name: "Work",
            color: "#123456",
            parent_id: null,
            system: false,
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
          },
        ],
      }) as never,
      new TagRepositoryStub({
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        tags: [
          {
            id: "tag-1",
            name: "work",
            description: "",
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
          },
        ],
      }) as never,
      taskRepository as never,
    );

    const result = await service.generate({
      project_id: "proj-1",
      tag_ids: ["tag-1"],
      count: 8,
    });

    expect(result.tasks).toHaveLength(8);
    expect(new Set(result.tasks.map((task) => task.title)).size).toBe(8);
    expect(result.tasks.every((task) => task.description)).toBe(true);
    expect(taskRepository.savedTaskFile?.tasks).toHaveLength(9);
  });

  it("assigns all selected tags when random tag mode is disabled", async () => {
    const taskRepository = new TaskRepositoryStub({
      schema_version: 1,
      updated_at: "2026-03-22T00:00:00.000Z",
      project_id: "proj-1",
      tasks: [],
    });
    const service = new TestDataService(
      new ProjectRepositoryStub({
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        projects: [
          {
            id: "proj-1",
            name: "Work",
            color: "#123456",
            parent_id: null,
            system: false,
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
          },
        ],
      }) as never,
      new TagRepositoryStub({
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        tags: [
          {
            id: "tag-1",
            name: "work",
            description: "",
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
          },
          {
            id: "tag-2",
            name: "urgent",
            description: "",
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
          },
        ],
      }) as never,
      taskRepository as never,
    );

    const result = await service.generate({
      project_id: "proj-1",
      tag_ids: ["tag-1", "tag-2"],
      count: 2,
      use_random_tags: false,
    });

    expect(result.tasks.every((task) => task.tag_ids.length === 2)).toBe(true);
    expect(result.tasks.every((task) => task.tag_ids.includes("tag-1") && task.tag_ids.includes("tag-2"))).toBe(true);
  });
});

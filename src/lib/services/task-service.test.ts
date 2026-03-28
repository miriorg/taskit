import { describe, expect, it } from "vitest";

import { DONE_PROJECT_ID, INBOX_PROJECT_ID } from "@/lib/utils/system-projects";
import type { ProjectMasterFile, TagMasterFile, TaskFile } from "@/types";

import { TaskService } from "./task-service";

class TaskRepositoryStub {
  private readonly files = new Map<string, TaskFile>();

  constructor(files: TaskFile[]) {
    files.forEach((file) => this.files.set(file.project_id, file));
  }

  async getByProjectId(projectId: string) {
    return this.files.get(projectId) ?? {
      schema_version: 1,
      updated_at: "2026-03-22T00:00:00.000Z",
      project_id: projectId,
      tasks: [],
    };
  }

  async save(taskFile: TaskFile) {
    this.files.set(taskFile.project_id, taskFile);
    return taskFile;
  }
}

class ProjectRepositoryStub {
  constructor(private readonly master: ProjectMasterFile) {}

  async getMaster() {
    return this.master;
  }
}

class TagRepositoryStub {
  constructor(private readonly master: TagMasterFile) {}

  async getMaster() {
    return this.master;
  }
}

const projectMaster: ProjectMasterFile = {
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
    {
      id: DONE_PROJECT_ID,
      name: "Done",
      color: "#556677",
      parent_id: null,
      system: true,
      created_at: "2026-03-22T00:00:00.000Z",
      updated_at: "2026-03-22T00:00:00.000Z",
    },
  ],
};

const tagMaster: TagMasterFile = {
  schema_version: 1,
  updated_at: "2026-03-22T00:00:00.000Z",
  tags: [
    {
      id: "tag-work",
      name: "work",
      created_at: "2026-03-22T00:00:00.000Z",
      updated_at: "2026-03-22T00:00:00.000Z",
    },
    {
      id: "tag-home",
      name: "home",
      created_at: "2026-03-22T00:00:00.000Z",
      updated_at: "2026-03-22T00:00:00.000Z",
    },
  ],
};

function createService() {
  return new TaskService(
    new TaskRepositoryStub([
      {
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        project_id: INBOX_PROJECT_ID,
        tasks: [
          {
            id: "task-1",
            project_id: INBOX_PROJECT_ID,
            title: "Write spec",
            description: null,
            due_date: "2026-03-23T03:00:00.000Z",
            priority: 2,
            status: "todo",
            tag_ids: ["tag-work"],
            reminders: [],
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
            completed_at: null,
          },
          {
            id: "task-2",
            project_id: INBOX_PROJECT_ID,
            title: "Buy milk",
            description: null,
            due_date: null,
            priority: null,
            status: "todo",
            tag_ids: ["tag-home"],
            reminders: [],
            created_at: "2026-03-22T01:00:00.000Z",
            updated_at: "2026-03-22T01:00:00.000Z",
            completed_at: null,
          },
        ],
      },
      {
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        project_id: "proj-parent",
        tasks: [
          {
            id: "task-parent",
            project_id: "proj-parent",
            title: "Parent task",
            description: null,
            due_date: "2026-03-24T03:00:00.000Z",
            priority: 3,
            status: "todo",
            tag_ids: [],
            reminders: [],
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
            completed_at: null,
          },
        ],
      },
      {
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        project_id: "proj-child",
        tasks: [
          {
            id: "task-child",
            project_id: "proj-child",
            title: "Child task",
            description: null,
            due_date: "2026-03-25T03:00:00.000Z",
            priority: 4,
            status: "todo",
            tag_ids: [],
            reminders: [],
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
            completed_at: null,
          },
        ],
      },
      {
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        project_id: DONE_PROJECT_ID,
        tasks: [
          {
            id: "task-3",
            project_id: DONE_PROJECT_ID,
            title: "Archive notes",
            description: null,
            due_date: "2026-03-21T03:00:00.000Z",
            priority: 1,
            status: "done",
            tag_ids: ["tag-work"],
            reminders: [],
            created_at: "2026-03-21T00:00:00.000Z",
            updated_at: "2026-03-21T00:00:00.000Z",
            completed_at: "2026-03-21T04:00:00.000Z",
          },
        ],
      },
    ]) as never,
    new ProjectRepositoryStub(projectMaster) as never,
    new TagRepositoryStub(tagMaster) as never,
  );
}

describe("TaskService.list", () => {
  it("separates open and completed tasks in the response", async () => {
    const service = createService();

    const result = await service.list();

    expect(result.todoItems.map((task) => task.id)).toEqual(["task-1", "task-parent", "task-child", "task-2"]);
    expect(result.completedItems.map((task) => task.id)).toEqual(["task-3"]);
    expect(result.items).toHaveLength(5);
  });

  it("filters by query and tag ids", async () => {
    const service = createService();

    const result = await service.list({
      query: "write",
      tagIds: ["tag-work"],
    });

    expect(result.todoItems.map((task) => task.id)).toEqual(["task-1"]);
    expect(result.completedItems).toEqual([]);
  });

  it("can exclude completed tasks", async () => {
    const service = createService();

    const result = await service.list({
      includeCompleted: false,
    });

    expect(result.items.map((task) => task.id)).toEqual(["task-1", "task-parent", "task-child", "task-2"]);
    expect(result.completedItems).toEqual([]);
  });

  it("can include descendant project tasks", async () => {
    const service = createService();

    const result = await service.list({
      projectId: "proj-parent",
      includeProjectDescendants: true,
      includeCompleted: false,
    });

    expect(result.items.map((task) => task.id)).toEqual(["task-parent", "task-child"]);
  });
});

describe("TaskService.update", () => {
  it("moves reopened tasks from done to inbox", async () => {
    const taskRepository = new TaskRepositoryStub([
      {
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        project_id: INBOX_PROJECT_ID,
        tasks: [],
      },
      {
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        project_id: DONE_PROJECT_ID,
        tasks: [
          {
            id: "task-done",
            project_id: DONE_PROJECT_ID,
            title: "Archive notes",
            description: null,
            due_date: null,
            priority: 1,
            status: "done",
            tag_ids: ["tag-work"],
            reminders: [],
            created_at: "2026-03-21T00:00:00.000Z",
            updated_at: "2026-03-21T00:00:00.000Z",
            completed_at: "2026-03-21T04:00:00.000Z",
          },
        ],
      },
    ]);
    const service = new TaskService(
      taskRepository as never,
      new ProjectRepositoryStub(projectMaster) as never,
      new TagRepositoryStub(tagMaster) as never,
    );

    const updated = await service.update("task-done", { status: "todo" });

    expect(updated.task.project_id).toBe(INBOX_PROJECT_ID);
    expect(updated.task.status).toBe("todo");
    expect(updated.task.completed_at).toBeNull();
    expect((await taskRepository.getByProjectId(DONE_PROJECT_ID)).tasks).toHaveLength(0);
    expect((await taskRepository.getByProjectId(INBOX_PROJECT_ID)).tasks.map((task) => task.id)).toContain("task-done");
  });
});

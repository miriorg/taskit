import { describe, expect, it } from "vitest";

import { DONE_PROJECT_ID, INBOX_PROJECT_ID } from "@/lib/utils/system-projects";
import type { ProjectMasterFile, TagMasterFile, TaskFile } from "@/types";

import { TagService } from "./tag-service";
import { TaskService } from "./task-service";

class TagRepositoryStub {
  savedMaster: TagMasterFile | null = null;

  constructor(private readonly master: TagMasterFile | null) {}

  async getMaster() {
    return this.savedMaster ?? this.master;
  }

  async save(master: TagMasterFile) {
    this.savedMaster = master;
    return master;
  }
}

class ProjectRepositoryStub {
  constructor(private readonly master: ProjectMasterFile | null) {}

  async getMaster() {
    return this.master;
  }
}

class TaskRepositoryStub {
  savedFiles = new Map<string, TaskFile>();

  constructor(private readonly files: TaskFile[]) {
    files.forEach((file) => this.savedFiles.set(file.project_id, file));
  }

  async getByProjectId(projectId: string) {
    return this.savedFiles.get(projectId) ?? {
      schema_version: 1,
      updated_at: "2026-03-22T00:00:00.000Z",
      project_id: projectId,
      tasks: [],
    };
  }

  async save(taskFile: TaskFile) {
    this.savedFiles.set(taskFile.project_id, taskFile);
    return taskFile;
  }
}

describe("TagService.delete", () => {
  it("removes deleted tag references from task files", async () => {
    const taskRepository = new TaskRepositoryStub([
      {
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        project_id: INBOX_PROJECT_ID,
        tasks: [
          {
            id: "task-1",
            project_id: INBOX_PROJECT_ID,
            title: "Task 1",
            description: null,
            due_date: null,
            priority: null,
            status: "todo",
            tag_ids: ["tag-deleted", "tag-keep"],
            reminders: [],
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
            completed_at: null,
          },
        ],
      },
    ]);
    const service = new TagService(
      new TagRepositoryStub({
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        tags: [
          {
            id: "tag-deleted",
            name: "deleted",
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
          },
          {
            id: "tag-keep",
            name: "keep",
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
          },
        ],
      }) as never,
      new ProjectRepositoryStub({
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        projects: [
          {
            id: INBOX_PROJECT_ID,
            name: "Inbox",
            color: "#808080",
            parent_id: null,
            system: true,
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
          },
        ],
      }) as never,
      taskRepository as never,
    );

    await service.delete("tag-deleted");

    const updatedTaskFile = await taskRepository.getByProjectId(INBOX_PROJECT_ID);
    expect(updatedTaskFile.tasks[0]?.tag_ids).toEqual(["tag-keep"]);
  });
});

describe("TaskService.update", () => {
  it("allows status updates even if the task still contains a stale deleted tag id", async () => {
    const taskRepository = new TaskRepositoryStub([
      {
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        project_id: INBOX_PROJECT_ID,
        tasks: [
          {
            id: "task-1",
            project_id: INBOX_PROJECT_ID,
            title: "Task 1",
            description: null,
            due_date: null,
            priority: null,
            status: "todo",
            tag_ids: ["tag-missing"],
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
        tasks: [],
      },
    ]);
    const service = new TaskService(
      taskRepository as never,
      new ProjectRepositoryStub({
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        projects: [
          {
            id: INBOX_PROJECT_ID,
            name: "Inbox",
            color: "#808080",
            parent_id: null,
            system: true,
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
          },
          {
            id: DONE_PROJECT_ID,
            name: "Done",
            color: "#4caf50",
            parent_id: null,
            system: true,
            created_at: "2026-03-22T00:00:00.000Z",
            updated_at: "2026-03-22T00:00:00.000Z",
          },
        ],
      }) as never,
      new TagRepositoryStub({
        schema_version: 1,
        updated_at: "2026-03-22T00:00:00.000Z",
        tags: [],
      }) as never,
    );

    const updated = await service.update("task-1", { status: "done" });

    expect(updated.status).toBe("done");
    expect(updated.project_id).toBe(DONE_PROJECT_ID);
  });
});

import { taskFileSchema } from "@/lib/validators";
import type { TaskFile } from "@/types";

import { DriveFileRepository, type DriveFileStore } from "./drive-file-repository";

const SCHEMA_VERSION = 1;

export function buildTaskFileName(projectId: string): `task-${string}.json` {
  return `task-${projectId}.json`;
}

export function createEmptyTaskFile(projectId: string): TaskFile {
  return {
    schema_version: SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
    project_id: projectId,
    tasks: [],
  };
}

export class TaskRepository {
  constructor(private readonly driveFileStore: DriveFileStore = new DriveFileRepository()) {}

  async getByProjectId(projectId: string): Promise<TaskFile> {
    const fileName = buildTaskFileName(projectId);
    const record = await this.driveFileStore.findByName(fileName);

    if (!record) {
      return createEmptyTaskFile(projectId);
    }

    const parsed = taskFileSchema.parse(JSON.parse(record.content));

    return {
      ...parsed,
      revision: record.revision,
    };
  }

  async save(taskFile: TaskFile, expectedRevision?: string): Promise<TaskFile> {
    const fileName = buildTaskFileName(taskFile.project_id);
    const parsed = taskFileSchema.parse({
      ...taskFile,
      updated_at: new Date().toISOString(),
    });
    const record = await this.driveFileStore.upsertJson(fileName, JSON.stringify(parsed, null, 2), expectedRevision);
    const saved = taskFileSchema.parse(JSON.parse(record.content));

    return {
      ...saved,
      revision: record.revision,
    };
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    await this.driveFileStore.deleteByName(buildTaskFileName(projectId));
  }
}

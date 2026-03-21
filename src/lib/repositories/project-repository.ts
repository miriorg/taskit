import { projectMasterFileSchema } from "@/lib/validators";
import type { ProjectMasterFile } from "@/types";

import { DriveFileRepository, type DriveFileStore } from "./drive-file-repository";

const FILE_NAME = "project.json";

export class ProjectRepository {
  constructor(private readonly driveFileStore: DriveFileStore = new DriveFileRepository()) {}

  async getMaster(): Promise<ProjectMasterFile | null> {
    const record = await this.driveFileStore.findByName(FILE_NAME);

    if (!record) {
      return null;
    }

    const parsed = projectMasterFileSchema.parse(JSON.parse(record.content));

    return {
      ...parsed,
      revision: record.revision,
    };
  }

  async save(masterFile: ProjectMasterFile, expectedRevision?: string): Promise<ProjectMasterFile> {
    const parsed = projectMasterFileSchema.parse(masterFile);
    const record = await this.driveFileStore.upsertJson(FILE_NAME, JSON.stringify(parsed, null, 2), expectedRevision);

    return {
      ...parsed,
      revision: record.revision,
    };
  }
}

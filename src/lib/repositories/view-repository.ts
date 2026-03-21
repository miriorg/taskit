import { viewMasterFileSchema } from "@/lib/validators";
import type { ViewMasterFile } from "@/types";

import { DriveFileRepository, type DriveFileStore } from "./drive-file-repository";

const FILE_NAME = "view.json";

export class ViewRepository {
  constructor(private readonly driveFileStore: DriveFileStore = new DriveFileRepository()) {}

  async getMaster(): Promise<ViewMasterFile | null> {
    const record = await this.driveFileStore.findByName(FILE_NAME);

    if (!record) {
      return null;
    }

    const parsed = viewMasterFileSchema.parse(JSON.parse(record.content));

    return {
      ...parsed,
      revision: record.revision,
    };
  }

  async save(masterFile: ViewMasterFile, expectedRevision?: string): Promise<ViewMasterFile> {
    const parsed = viewMasterFileSchema.parse(masterFile);
    const record = await this.driveFileStore.upsertJson(FILE_NAME, JSON.stringify(parsed, null, 2), expectedRevision);

    return {
      ...parsed,
      revision: record.revision,
    };
  }
}

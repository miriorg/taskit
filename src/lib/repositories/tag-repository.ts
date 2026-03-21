import { tagMasterFileSchema } from "@/lib/validators";
import type { TagMasterFile } from "@/types";

import { DriveFileRepository, type DriveFileStore } from "./drive-file-repository";

const FILE_NAME = "tag.json";

export class TagRepository {
  constructor(private readonly driveFileStore: DriveFileStore = new DriveFileRepository()) {}

  async getMaster(): Promise<TagMasterFile | null> {
    const record = await this.driveFileStore.findByName(FILE_NAME);

    if (!record) {
      return null;
    }

    const parsed = tagMasterFileSchema.parse(JSON.parse(record.content));

    return {
      ...parsed,
      revision: record.revision,
    };
  }

  async save(masterFile: TagMasterFile, expectedRevision?: string): Promise<TagMasterFile> {
    const parsed = tagMasterFileSchema.parse(masterFile);
    const record = await this.driveFileStore.upsertJson(FILE_NAME, JSON.stringify(parsed, null, 2), expectedRevision);

    return {
      ...parsed,
      revision: record.revision,
    };
  }
}

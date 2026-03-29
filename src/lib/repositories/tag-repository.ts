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

    const raw = JSON.parse(record.content) as {
      schema_version: number;
      updated_at: string;
      revision?: string;
      tags?: Array<{ description?: unknown }>;
    };
    const parsed = tagMasterFileSchema.parse(raw);
    const needsMigration =
      Array.isArray(raw.tags) &&
      raw.tags.some((tag, index) => parsed.tags[index] && parsed.tags[index].description !== (typeof tag?.description === "string" ? tag.description : ""));

    if (needsMigration) {
      return this.save(
        {
          ...parsed,
          revision: record.revision,
        },
        record.revision,
      );
    }

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

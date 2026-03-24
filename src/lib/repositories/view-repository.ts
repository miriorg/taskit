import { migrateLegacyViewSort } from "@/lib/task-list-sort";
import { viewMasterFileSchema } from "@/lib/validators";
import type { LegacyViewSort, ViewMasterFile, ViewSort } from "@/types";

import { DriveFileRepository, type DriveFileStore } from "./drive-file-repository";

const FILE_NAME = "view.json";

export class ViewRepository {
  constructor(private readonly driveFileStore: DriveFileStore = new DriveFileRepository()) {}

  async getMaster(): Promise<ViewMasterFile | null> {
    const record = await this.driveFileStore.findByName(FILE_NAME);

    if (!record) {
      return null;
    }

    const parsed = viewMasterFileSchema.parse(JSON.parse(record.content)) as Omit<ViewMasterFile, "views"> & {
      views: Array<Omit<ViewMasterFile["views"][number], "sort"> & { sort: ViewSort | LegacyViewSort }>;
    };

    const views: ViewMasterFile["views"] = parsed.views.map((view) => ({
      id: view.id,
      name: view.name,
      filters: view.filters,
      sort: migrateLegacyViewSort(view.sort),
      display_options: view.display_options,
      created_at: view.created_at,
      updated_at: view.updated_at,
    }));

    return {
      schema_version: parsed.schema_version,
      updated_at: parsed.updated_at,
      views,
      revision: record.revision,
    };
  }

  async save(masterFile: ViewMasterFile, expectedRevision?: string): Promise<ViewMasterFile> {
    viewMasterFileSchema.parse(masterFile);
    const record = await this.driveFileStore.upsertJson(FILE_NAME, JSON.stringify(masterFile, null, 2), expectedRevision);

    return {
      ...masterFile,
      revision: record.revision,
    };
  }
}

import type { Revision } from "@/types";

export type DriveFileRecord = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  revision: Revision;
  content: string;
};

export class DriveFileRepository {
  async findByName(_name: string): Promise<DriveFileRecord | null> {
    throw new Error("Not implemented");
  }

  async upsertJson(_name: string, _content: string, _expectedRevision?: Revision): Promise<DriveFileRecord> {
    throw new Error("Not implemented");
  }

  async deleteByName(_name: string): Promise<void> {
    throw new Error("Not implemented");
  }
}

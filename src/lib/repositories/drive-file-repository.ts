import type { Revision } from "@/types";

export type DriveFileRecord = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  revision: Revision;
  content: string;
};

export interface DriveFileStore {
  findByName(name: string): Promise<DriveFileRecord | null>;
  upsertJson(name: string, content: string, expectedRevision?: Revision): Promise<DriveFileRecord>;
  deleteByName(name: string): Promise<void>;
}

export class DriveFileRepository implements DriveFileStore {
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

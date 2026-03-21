import type { Revision } from "@/types";
import { createDriveClient, type DriveClient } from "@/lib/drive/client";
import { requireSession, type AppSession } from "@/lib/auth/session";

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

type GoogleDriveFileListResponse = {
  files?: Array<{
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    version?: string;
  }>;
};

function buildRevision(file: { id: string; version?: string; modifiedTime: string }): Revision {
  return `${file.id}:${file.version ?? file.modifiedTime}`;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function assertSuccessfulResponse(response: Response, action: string): Promise<void> {
  if (response.ok) {
    return;
  }

  const errorBody = await response.text();
  throw new Error(`Google Drive ${action} failed: ${response.status} ${errorBody}`);
}

export class DriveFileRepository implements DriveFileStore {
  constructor(
    private readonly driveClientFactory: (session: AppSession) => Promise<DriveClient> = createDriveClient,
    private readonly sessionResolver: () => Promise<AppSession> = requireSession,
  ) {}

  private async createAuthorizedHeaders(contentType?: string): Promise<Headers> {
    const session = await this.sessionResolver();
    const driveClient = await this.driveClientFactory(session);
    const headers = new Headers({
      Authorization: `Bearer ${driveClient.accessToken}`,
    });

    if (contentType) {
      headers.set("Content-Type", contentType);
    }

    return headers;
  }

  private async listByName(name: string): Promise<NonNullable<GoogleDriveFileListResponse["files"]>> {
    const headers = await this.createAuthorizedHeaders();
    const query = [
      `name='${escapeDriveQueryValue(name)}'`,
      "trashed=false",
      "'appDataFolder' in parents",
    ].join(" and ");
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("spaces", "appDataFolder");
    url.searchParams.set("q", query);
    url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,version)");
    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    await assertSuccessfulResponse(response, "file search");
    const body = (await response.json()) as GoogleDriveFileListResponse;

    return body.files ?? [];
  }

  private async downloadContent(fileId: string): Promise<string> {
    const headers = await this.createAuthorizedHeaders();
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
    url.searchParams.set("alt", "media");
    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    await assertSuccessfulResponse(response, "file download");
    return response.text();
  }

  async findByName(name: string): Promise<DriveFileRecord | null> {
    const files = await this.listByName(name);
    const file = files[0];

    if (!file) {
      return null;
    }

    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      revision: buildRevision(file),
      content: await this.downloadContent(file.id),
    };
  }

  async upsertJson(name: string, content: string, expectedRevision?: Revision): Promise<DriveFileRecord> {
    const existing = await this.findByName(name);

    if (existing && expectedRevision && existing.revision !== expectedRevision) {
      throw new Error(`Revision conflict for ${name}`);
    }

    const metadata = {
      name,
      parents: ["appDataFolder"],
      mimeType: "application/json",
    };
    const boundary = "taskit-drive-upload-boundary";
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      content,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const headers = await this.createAuthorizedHeaders(`multipart/related; boundary=${boundary}`);
    const baseUrl = existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}`
      : "https://www.googleapis.com/upload/drive/v3/files";
    const url = new URL(baseUrl);
    url.searchParams.set("uploadType", "multipart");
    url.searchParams.set("fields", "id,name,mimeType,modifiedTime,version");
    const response = await fetch(url, {
      method: existing ? "PATCH" : "POST",
      headers,
      body,
    });

    await assertSuccessfulResponse(response, existing ? "file update" : "file create");
    const file = (await response.json()) as {
      id: string;
      name: string;
      mimeType: string;
      modifiedTime: string;
      version?: string;
    };

    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime,
      revision: buildRevision(file),
      content,
    };
  }

  async deleteByName(name: string): Promise<void> {
    const existing = await this.findByName(name);

    if (!existing) {
      return;
    }

    const headers = await this.createAuthorizedHeaders();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${existing.id}`, {
      method: "DELETE",
      headers,
    });

    await assertSuccessfulResponse(response, "file delete");
  }
}

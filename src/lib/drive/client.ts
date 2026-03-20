import type { AppSession } from "../auth/session";

export type DriveClient = {
  appDataFolderName: string;
};

export async function createDriveClient(_session: AppSession): Promise<DriveClient> {
  throw new Error("Not implemented");
}

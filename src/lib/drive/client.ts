import type { AppSession } from "../auth/session";

export type DriveClient = {
  appDataFolderName: string;
  accessToken?: string;
};

export async function createDriveClient(session: AppSession): Promise<DriveClient> {
  return {
    appDataFolderName: "appDataFolder",
    accessToken: session.google?.accessToken,
  };
}

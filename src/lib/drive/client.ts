import type { AppSession } from "../auth/session";

export type DriveClient = {
  appDataFolderName: string;
  accessToken: string;
};

export async function createDriveClient(session: AppSession): Promise<DriveClient> {
  const accessToken = session.google?.accessToken;

  if (!accessToken) {
    throw new Error("Google Drive access token is missing");
  }

  return {
    appDataFolderName: "appDataFolder",
    accessToken,
  };
}

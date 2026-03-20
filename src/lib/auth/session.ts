export type AppSession = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  google?: {
    accessToken?: string;
    refreshToken?: string;
  };
};

export async function requireSession(): Promise<AppSession> {
  throw new Error("Not implemented");
}

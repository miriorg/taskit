import type { Session } from "next-auth";
import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/auth";

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

export function mapSessionToAppSession(session: Session | null): AppSession | null {
  if (!session?.user?.email) {
    return null;
  }

  return {
    user: {
      id: session.user.email,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
  };
}

export async function getOptionalSession(): Promise<AppSession | null> {
  const session = await getServerSession(getAuthOptions());
  return mapSessionToAppSession(session);
}

export async function requireSession(): Promise<AppSession> {
  const session = await getOptionalSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}

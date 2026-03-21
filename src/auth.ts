import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export type AuthEnvironment = {
  nextAuthSecret: string;
  googleClientId: string;
  googleClientSecret: string;
};

type AuthEnvironmentSource = Record<string, string | undefined>;

export function resolveAuthEnvironment(env: AuthEnvironmentSource = process.env): AuthEnvironment {
  const nextAuthSecret = env.NEXTAUTH_SECRET;
  const googleClientId = env.GOOGLE_CLIENT_ID;
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!nextAuthSecret) {
    throw new Error("NEXTAUTH_SECRET is required");
  }

  if (!googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID is required");
  }

  if (!googleClientSecret) {
    throw new Error("GOOGLE_CLIENT_SECRET is required");
  }

  return {
    nextAuthSecret,
    googleClientId,
    googleClientSecret,
  };
}

export function createAuthOptions(env: AuthEnvironmentSource = process.env): NextAuthOptions {
  const authEnvironment = resolveAuthEnvironment(env);

  return {
    secret: authEnvironment.nextAuthSecret,
    session: {
      strategy: "jwt",
    },
    providers: [
      GoogleProvider({
        clientId: authEnvironment.googleClientId,
        clientSecret: authEnvironment.googleClientSecret,
        authorization: {
          params: {
            scope: "openid email profile https://www.googleapis.com/auth/drive.appdata",
            prompt: "consent",
            access_type: "offline",
            response_type: "code",
          },
        },
      }),
    ],
    callbacks: {
      async jwt({ token, account }) {
        if (account?.access_token) {
          token.accessToken = account.access_token;
        }

        if (account?.refresh_token) {
          token.refreshToken = account.refresh_token;
        }

        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.email = session.user.email ?? token.email ?? null;
        }

        session.accessToken = typeof token.accessToken === "string" ? token.accessToken : undefined;
        session.refreshToken = typeof token.refreshToken === "string" ? token.refreshToken : undefined;

        return session;
      },
    },
  };
}

export function getAuthOptions(env: AuthEnvironmentSource = process.env): NextAuthOptions {
  return createAuthOptions({
    ...env,
    NEXTAUTH_SECRET: env.NEXTAUTH_SECRET ?? "development-secret-change-me",
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ?? "development-google-client-id",
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ?? "development-google-client-secret",
  });
}

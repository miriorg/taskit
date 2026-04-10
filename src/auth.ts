import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";

export type AuthEnvironment = {
  nextAuthSecret: string;
  googleClientId: string;
  googleClientSecret: string;
};

type AuthEnvironmentSource = Record<string, string | undefined>;

type GoogleTokenRefreshResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

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

export async function refreshGoogleAccessToken(
  token: JWT,
  authEnvironment: AuthEnvironment,
): Promise<JWT> {
  if (!token.refreshToken) {
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: authEnvironment.googleClientId,
      client_secret: authEnvironment.googleClientSecret,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    }),
  });

  if (!response.ok) {
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }

  const refreshedTokens = (await response.json()) as GoogleTokenRefreshResponse;

  return {
    ...token,
    accessToken: refreshedTokens.access_token,
    accessTokenExpiresAt: Date.now() + refreshedTokens.expires_in * 1000,
    refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    error: undefined,
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
            scope: "openid email profile",
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
          token.accessTokenExpiresAt = account.expires_at ? account.expires_at * 1000 : undefined;
        }

        if (account?.refresh_token) {
          token.refreshToken = account.refresh_token;
        }

        if (typeof token.accessTokenExpiresAt === "number" && Date.now() < token.accessTokenExpiresAt) {
          return token;
        }

        if (token.accessToken && token.refreshToken) {
          return refreshGoogleAccessToken(token, authEnvironment);
        }

        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.email = session.user.email ?? token.email ?? null;
        }

        session.accessToken = typeof token.accessToken === "string" ? token.accessToken : undefined;
        session.refreshToken = typeof token.refreshToken === "string" ? token.refreshToken : undefined;
        session.error = typeof token.error === "string" ? token.error : undefined;

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

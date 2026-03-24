import type { Session } from "next-auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAuthOptions, refreshGoogleAccessToken, resolveAuthEnvironment } from "@/auth";
import { mapSessionToAppSession } from "@/lib/auth/session";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveAuthEnvironment", () => {
  it("throws when NEXTAUTH_SECRET is missing", () => {
    expect(() =>
      resolveAuthEnvironment({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
      }),
    ).toThrow("NEXTAUTH_SECRET is required");
  });

  it("returns the normalized auth environment when required values exist", () => {
    expect(
      resolveAuthEnvironment({
        NEXTAUTH_SECRET: "secret",
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
      }),
    ).toEqual({
      nextAuthSecret: "secret",
      googleClientId: "client-id",
      googleClientSecret: "client-secret",
    });
  });
});

describe("createAuthOptions", () => {
  it("builds auth options with jwt session strategy and google provider", () => {
    const options = createAuthOptions({
      NEXTAUTH_SECRET: "secret",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
    });

    expect(options.secret).toBe("secret");
    expect(options.session?.strategy).toBe("jwt");
    expect(options.providers).toHaveLength(1);
    expect(options.providers?.[0]?.id).toBe("google");
  });

  it("stores token expiry when Google account data is present", async () => {
    const options = createAuthOptions({
      NEXTAUTH_SECRET: "secret",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
    });

    const token = await options.callbacks!.jwt!({
      token: {},
      account: {
        provider: "google",
        type: "oauth",
        providerAccountId: "provider-account-id",
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
      user: undefined as never,
      profile: undefined,
      trigger: "signIn",
      isNewUser: false,
      session: undefined,
    });

    expect(token.accessToken).toBe("access-token");
    expect(token.refreshToken).toBe("refresh-token");
    expect(typeof token.accessTokenExpiresAt).toBe("number");
  });
});

describe("refreshGoogleAccessToken", () => {
  it("refreshes the access token when the refresh request succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "new-access-token",
          expires_in: 3600,
        }),
      }),
    );

    const token = await refreshGoogleAccessToken(
      {
        refreshToken: "refresh-token",
        accessToken: "old-access-token",
      },
      {
        nextAuthSecret: "secret",
        googleClientId: "client-id",
        googleClientSecret: "client-secret",
      },
    );

    expect(token.accessToken).toBe("new-access-token");
    expect(token.refreshToken).toBe("refresh-token");
    expect(typeof token.accessTokenExpiresAt).toBe("number");
    expect(token.error).toBeUndefined();
  });

  it("marks the token with an error when the refresh request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    );

    const token = await refreshGoogleAccessToken(
      {
        refreshToken: "refresh-token",
        accessToken: "old-access-token",
      },
      {
        nextAuthSecret: "secret",
        googleClientId: "client-id",
        googleClientSecret: "client-secret",
      },
    );

    expect(token.error).toBe("RefreshAccessTokenError");
  });
});

describe("mapSessionToAppSession", () => {
  it("returns null when email is missing", () => {
    const session = {
      user: {
        name: "No Email",
      },
      expires: "2026-01-01T00:00:00.000Z",
    } satisfies Session;

    expect(mapSessionToAppSession(session)).toBeNull();
  });

  it("maps a NextAuth session into the app session shape", () => {
    const session = {
      user: {
        name: "Miri",
        email: "miri@example.com",
        image: "https://example.com/avatar.png",
      },
      expires: "2026-01-01T00:00:00.000Z",
    } satisfies Session;

    expect(mapSessionToAppSession(session)).toEqual({
      user: {
        id: "miri@example.com",
        name: "Miri",
        email: "miri@example.com",
        image: "https://example.com/avatar.png",
      },
      google: {
        accessToken: undefined,
        refreshToken: undefined,
      },
    });
  });
});

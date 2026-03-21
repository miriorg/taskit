import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";

import { createAuthOptions, resolveAuthEnvironment } from "@/auth";
import { mapSessionToAppSession } from "@/lib/auth/session";

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

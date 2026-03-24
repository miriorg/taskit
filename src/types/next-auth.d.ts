import type { DefaultSession } from "next-auth";
import type { JWT as DefaultJwt } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"];
    accessToken?: string;
    refreshToken?: string;
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJwt {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    error?: string;
  }
}

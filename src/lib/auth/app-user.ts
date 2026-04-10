import { getOptionalSession, requireSession } from "@/lib/auth/session";
import { PostgresUserRepository } from "@/lib/repositories/postgres-user-repository";
import type { AppSession } from "@/lib/auth/session";
import type { User } from "@/types";

type SessionResolver = () => Promise<AppSession | null>;
type RequiredSessionResolver = () => Promise<AppSession>;

export async function getOptionalAppUser(
  sessionResolver: SessionResolver = getOptionalSession,
  userRepository: PostgresUserRepository = new PostgresUserRepository(),
): Promise<User | null> {
  const session = await sessionResolver();

  if (!session?.user.email) {
    return null;
  }

  return userRepository.upsertByEmail({
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });
}

export async function requireAppUser(
  sessionResolver: RequiredSessionResolver = requireSession,
  userRepository: PostgresUserRepository = new PostgresUserRepository(),
): Promise<User> {
  const session = await sessionResolver();

  return userRepository.upsertByEmail({
    email: session.user.email ?? "",
    name: session.user.name,
    image: session.user.image,
  });
}

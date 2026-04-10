import postgres, { type Sql } from "postgres";

type DatabaseEnvironmentSource = Record<string, string | undefined>;

export type DatabaseEnvironment = {
  databaseUrl: string;
  databaseUrlUnpooled: string;
};

type GlobalDatabaseCache = typeof globalThis & {
  __taskitDbClient?: Sql;
  __taskitAdminDbClient?: Sql;
};

export function resolveDatabaseEnvironment(env: DatabaseEnvironmentSource = process.env): DatabaseEnvironment {
  const databaseUrl = env.DATABASE_URL;
  const databaseUrlUnpooled = env.DATABASE_URL_UNPOOLED;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (!databaseUrlUnpooled) {
    throw new Error("DATABASE_URL_UNPOOLED is required");
  }

  return {
    databaseUrl,
    databaseUrlUnpooled,
  };
}

export function createDbClient(env: DatabaseEnvironmentSource = process.env): Sql {
  const { databaseUrl } = resolveDatabaseEnvironment(env);

  return postgres(databaseUrl, {
    max: 1,
    prepare: false,
  });
}

export function createAdminDbClient(env: DatabaseEnvironmentSource = process.env): Sql {
  const { databaseUrlUnpooled } = resolveDatabaseEnvironment(env);

  return postgres(databaseUrlUnpooled, {
    max: 1,
    prepare: false,
  });
}

export function getDbClient(env: DatabaseEnvironmentSource = process.env): Sql {
  if (process.env.NODE_ENV === "production") {
    return createDbClient(env);
  }

  const globalDatabaseCache = globalThis as GlobalDatabaseCache;

  if (!globalDatabaseCache.__taskitDbClient) {
    globalDatabaseCache.__taskitDbClient = createDbClient(env);
  }

  return globalDatabaseCache.__taskitDbClient;
}

export function getAdminDbClient(env: DatabaseEnvironmentSource = process.env): Sql {
  if (process.env.NODE_ENV === "production") {
    return createAdminDbClient(env);
  }

  const globalDatabaseCache = globalThis as GlobalDatabaseCache;

  if (!globalDatabaseCache.__taskitAdminDbClient) {
    globalDatabaseCache.__taskitAdminDbClient = createAdminDbClient(env);
  }

  return globalDatabaseCache.__taskitAdminDbClient;
}

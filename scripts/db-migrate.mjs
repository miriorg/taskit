import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

if (!process.env.DATABASE_URL_UNPOOLED) {
  throw new Error("DATABASE_URL_UNPOOLED is required");
}

const migrationsDirectory = path.resolve("migrations");
const sql = postgres(process.env.DATABASE_URL_UNPOOLED, {
  max: 1,
  prepare: false,
});

function checksumFor(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

try {
  await sql.unsafe(`
    create table if not exists schema_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((entry) => entry.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  for (const filename of migrationFiles) {
    const migrationPath = path.join(migrationsDirectory, filename);
    const contents = await readFile(migrationPath, "utf8");
    const checksum = checksumFor(contents);
    const [appliedMigration] = await sql`
      select filename, checksum
      from schema_migrations
      where filename = ${filename}
    `;

    if (appliedMigration) {
      if (appliedMigration.checksum !== checksum) {
        throw new Error(`Migration checksum mismatch for ${filename}`);
      }

      console.log(`skip ${filename}`);
      continue;
    }

    await sql.begin(async (transaction) => {
      await transaction.unsafe(contents);
      await transaction`
        insert into schema_migrations (filename, checksum)
        values (${filename}, ${checksum})
      `;
    });

    console.log(`applied ${filename}`);
  }
} finally {
  await sql.end();
}

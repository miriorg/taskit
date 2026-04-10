import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
});

try {
  const [row] = await sql.unsafe(
    "select current_database() as database, current_user as current_user, now() as connected_at",
  );

  console.log(JSON.stringify(row, null, 2));
} finally {
  await sql.end();
}

import { randomUUID } from "node:crypto";

import { getDbClient } from "@/lib/db/client";
import type { User } from "@/types";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  created_at: string;
  updated_at: string;
};

export type UpsertUserInput = {
  email: string;
  name?: string | null;
  image?: string | null;
};

function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class PostgresUserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const sql = getDbClient();
    const [row] = await sql<UserRow[]>`
      select id, email, name, image, created_at, updated_at
      from users
      where lower(email) = lower(${email})
      limit 1
    `;

    return row ? mapUserRow(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const sql = getDbClient();
    const [row] = await sql<UserRow[]>`
      select id, email, name, image, created_at, updated_at
      from users
      where id = ${id}
      limit 1
    `;

    return row ? mapUserRow(row) : null;
  }

  async upsertByEmail(input: UpsertUserInput): Promise<User> {
    const sql = getDbClient();
    const [row] = await sql<UserRow[]>`
      insert into users (id, email, name, image)
      values (${randomUUID()}, ${input.email}, ${input.name ?? null}, ${input.image ?? null})
      on conflict (email)
      do update
      set
        name = excluded.name,
        image = excluded.image,
        updated_at = now()
      returning id, email, name, image, created_at, updated_at
    `;

    return mapUserRow(row);
  }
}

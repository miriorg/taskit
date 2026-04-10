import { getDbClient } from "@/lib/db/client";
import type { Reminder, Task } from "@/types";

type TaskRow = {
  id: string;
  owner_user_id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: number | null;
  status: Task["status"];
  completed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type TaskTagRow = {
  task_id: string;
  tag_id: string;
};

type ReminderRow = {
  id: string;
  task_id: string;
  remind_at: string;
};

export type TaskRecord = Task & {
  owner_user_id: string;
  version: number;
};

export type CreateTaskRecordInput = {
  id: string;
  owner_user_id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: number | null;
  status: Task["status"];
  tag_ids: string[];
  reminders?: Reminder[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UpdateTaskRecordInput = {
  id: string;
  owner_user_id: string;
  project_id?: string;
  title?: string;
  description?: string | null;
  due_date?: string | null;
  priority?: number | null;
  status?: Task["status"];
  tag_ids?: string[];
  completed_at?: string | null;
  updated_at: string;
  expectedVersion?: number;
};

function mapTaskRow(
  row: TaskRow,
  tagIds: string[],
  reminders: Reminder[],
): TaskRecord {
  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    due_date: row.due_date,
    priority: row.priority,
    status: row.status,
    tag_ids: tagIds,
    reminders,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    version: row.version,
  };
}

export class PostgresTaskRepository {
  private async attachRelations(taskRows: TaskRow[]): Promise<TaskRecord[]> {
    if (taskRows.length === 0) {
      return [];
    }

    const sql = getDbClient();
    const taskIds = taskRows.map((row) => row.id);
    const [taskTags, reminderRows] = await Promise.all([
      sql<TaskTagRow[]>`
        select task_id, tag_id
        from task_tags
        where task_id in ${sql(taskIds)}
      `,
      sql<ReminderRow[]>`
        select id, task_id, remind_at
        from reminders
        where task_id in ${sql(taskIds)}
        order by remind_at asc
      `,
    ]);

    const tagIdsByTask = new Map<string, string[]>();
    for (const row of taskTags) {
      const taskTagIds = tagIdsByTask.get(row.task_id) ?? [];
      taskTagIds.push(row.tag_id);
      tagIdsByTask.set(row.task_id, taskTagIds);
    }

    const remindersByTask = new Map<string, Reminder[]>();
    for (const row of reminderRows) {
      const taskReminders = remindersByTask.get(row.task_id) ?? [];
      taskReminders.push({
        id: row.id,
        remind_at: row.remind_at,
      });
      remindersByTask.set(row.task_id, taskReminders);
    }

    return taskRows.map((row) => mapTaskRow(row, tagIdsByTask.get(row.id) ?? [], remindersByTask.get(row.id) ?? []));
  }

  async listByOwner(ownerUserId: string): Promise<TaskRecord[]> {
    const sql = getDbClient();
    const rows = await sql<TaskRow[]>`
      select id, owner_user_id, project_id, title, description, due_date, priority, status, completed_at, version, created_at, updated_at
      from tasks
      where owner_user_id = ${ownerUserId}
      order by created_at asc, id asc
    `;

    return this.attachRelations(rows);
  }

  async listByProjectIds(ownerUserId: string, projectIds: string[]): Promise<TaskRecord[]> {
    if (projectIds.length === 0) {
      return [];
    }

    const sql = getDbClient();
    const rows = await sql<TaskRow[]>`
      select id, owner_user_id, project_id, title, description, due_date, priority, status, completed_at, version, created_at, updated_at
      from tasks
      where owner_user_id = ${ownerUserId}
        and project_id in ${sql(projectIds)}
      order by created_at asc, id asc
    `;

    return this.attachRelations(rows);
  }

  async findById(ownerUserId: string, taskId: string): Promise<TaskRecord | null> {
    const sql = getDbClient();
    const rows = await sql<TaskRow[]>`
      select id, owner_user_id, project_id, title, description, due_date, priority, status, completed_at, version, created_at, updated_at
      from tasks
      where owner_user_id = ${ownerUserId}
        and id = ${taskId}
      limit 1
    `;

    const [task] = await this.attachRelations(rows);
    return task ?? null;
  }

  async create(input: CreateTaskRecordInput): Promise<TaskRecord> {
    const sql = getDbClient();

    return sql.begin(async (transaction) => {
      const [taskRow] = await transaction<TaskRow[]>`
        insert into tasks (
          id,
          owner_user_id,
          project_id,
          title,
          description,
          due_date,
          priority,
          status,
          completed_at,
          created_at,
          updated_at
        )
        values (
          ${input.id},
          ${input.owner_user_id},
          ${input.project_id},
          ${input.title},
          ${input.description},
          ${input.due_date},
          ${input.priority},
          ${input.status},
          ${input.completed_at},
          ${input.created_at},
          ${input.updated_at}
        )
        returning id, owner_user_id, project_id, title, description, due_date, priority, status, completed_at, version, created_at, updated_at
      `;

      for (const tagId of input.tag_ids) {
        await transaction`
          insert into task_tags (task_id, tag_id)
          values (${taskRow.id}, ${tagId})
        `;
      }

      for (const reminder of input.reminders ?? []) {
        await transaction`
          insert into reminders (id, task_id, remind_at)
          values (${reminder.id}, ${taskRow.id}, ${reminder.remind_at})
        `;
      }

      return mapTaskRow(taskRow, input.tag_ids, input.reminders ?? []);
    });
  }

  async update(input: UpdateTaskRecordInput): Promise<TaskRecord> {
    const sql = getDbClient();
    const title = input.title ?? null;
    const status = input.status ?? null;
    const projectId = input.project_id ?? null;
    let rows: TaskRow[];

    if (input.expectedVersion === undefined) {
      rows = await sql<TaskRow[]>`
        update tasks
        set
          project_id = coalesce(${projectId}, project_id),
          title = coalesce(${title}, title),
          description = ${input.description === undefined ? sql`description` : input.description},
          due_date = ${input.due_date === undefined ? sql`due_date` : input.due_date},
          priority = ${input.priority === undefined ? sql`priority` : input.priority},
          status = coalesce(${status}, status),
          completed_at = ${input.completed_at === undefined ? sql`completed_at` : input.completed_at},
          version = version + 1,
          updated_at = ${input.updated_at}
        where owner_user_id = ${input.owner_user_id}
          and id = ${input.id}
        returning id, owner_user_id, project_id, title, description, due_date, priority, status, completed_at, version, created_at, updated_at
      `;
    } else {
      rows = await sql<TaskRow[]>`
        update tasks
        set
          project_id = coalesce(${projectId}, project_id),
          title = coalesce(${title}, title),
          description = ${input.description === undefined ? sql`description` : input.description},
          due_date = ${input.due_date === undefined ? sql`due_date` : input.due_date},
          priority = ${input.priority === undefined ? sql`priority` : input.priority},
          status = coalesce(${status}, status),
          completed_at = ${input.completed_at === undefined ? sql`completed_at` : input.completed_at},
          version = version + 1,
          updated_at = ${input.updated_at}
        where owner_user_id = ${input.owner_user_id}
          and id = ${input.id}
          and version = ${input.expectedVersion}
        returning id, owner_user_id, project_id, title, description, due_date, priority, status, completed_at, version, created_at, updated_at
      `;
    }

    const [taskRow] = rows;

    if (!taskRow) {
      throw new Error("Task not found or version conflict");
    }

    if (input.tag_ids !== undefined) {
      await sql.begin(async (transaction) => {
        await transaction`
          delete from task_tags
          where task_id = ${taskRow.id}
        `;

        for (const tagId of input.tag_ids ?? []) {
          await transaction`
            insert into task_tags (task_id, tag_id)
            values (${taskRow.id}, ${tagId})
          `;
        }
      });
    }

    const [task] = await this.attachRelations([taskRow]);
    return task;
  }

  async delete(ownerUserId: string, taskId: string): Promise<TaskRecord | null> {
    const sql = getDbClient();
    const rows = await sql<TaskRow[]>`
      delete from tasks
      where owner_user_id = ${ownerUserId}
        and id = ${taskId}
      returning id, owner_user_id, project_id, title, description, due_date, priority, status, completed_at, version, created_at, updated_at
    `;

    const [task] = await this.attachRelations(rows);
    return task ?? null;
  }

  async deleteByProjectIds(ownerUserId: string, projectIds: string[]): Promise<string[]> {
    if (projectIds.length === 0) {
      return [];
    }

    const sql = getDbClient();
    const rows = await sql<{ id: string }[]>`
      delete from tasks
      where owner_user_id = ${ownerUserId}
        and project_id in ${sql(projectIds)}
      returning id
    `;

    return rows.map((row) => row.id);
  }
}

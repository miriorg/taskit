import { z } from "zod";

const isoDateStringSchema = z.string().datetime({ offset: true });

export const revisionSchema = z.string().min(1);

export const reminderSchema = z.object({
  id: z.string().min(1),
  remind_at: isoDateStringSchema,
});

export const taskSchema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  title: z.string().trim().min(1),
  description: z.string().nullable(),
  due_date: isoDateStringSchema.nullable(),
  priority: z.number().int().min(0).max(9).nullable(),
  status: z.enum(["todo", "done"]),
  tag_ids: z.array(z.string().min(1)),
  reminders: z.array(reminderSchema),
  created_at: isoDateStringSchema,
  updated_at: isoDateStringSchema,
  completed_at: isoDateStringSchema.nullable(),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  color: z.string().trim().min(1),
  parent_id: z.string().min(1).nullable(),
  system: z.boolean(),
  created_at: isoDateStringSchema,
  updated_at: isoDateStringSchema,
});

export const tagSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  created_at: isoDateStringSchema,
  updated_at: isoDateStringSchema,
});

export const viewFiltersSchema = z.object({
  due: z.enum(["today", "overdue", "any", "none"]).optional(),
  project_ids: z.array(z.string().min(1)),
  tag_ids: z.array(z.string().min(1)),
  include_project_descendants: z.boolean().optional(),
  query: z.string().trim().optional(),
});

export const viewSortSchema = z.object({
  field: z.enum(["due_date", "created_at", "updated_at", "priority", "title"]),
  direction: z.enum(["asc", "desc"]),
});

export const viewDisplayOptionsSchema = z.object({
  show_completed: z.boolean(),
});

export const viewSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  filters: viewFiltersSchema,
  sort: viewSortSchema,
  display_options: viewDisplayOptionsSchema,
  created_at: isoDateStringSchema,
  updated_at: isoDateStringSchema,
});

export const projectMasterFileSchema = z.object({
  schema_version: z.number().int().min(1),
  updated_at: isoDateStringSchema,
  revision: revisionSchema.optional(),
  projects: z.array(projectSchema),
});

export const tagMasterFileSchema = z.object({
  schema_version: z.number().int().min(1),
  updated_at: isoDateStringSchema,
  revision: revisionSchema.optional(),
  tags: z.array(tagSchema),
});

export const viewMasterFileSchema = z.object({
  schema_version: z.number().int().min(1),
  updated_at: isoDateStringSchema,
  revision: revisionSchema.optional(),
  views: z.array(viewSchema),
});

export const taskFileSchema = z.object({
  schema_version: z.number().int().min(1),
  updated_at: isoDateStringSchema,
  revision: revisionSchema.optional(),
  project_id: z.string().min(1),
  tasks: z.array(taskSchema),
});

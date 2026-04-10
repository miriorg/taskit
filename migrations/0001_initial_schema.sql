create table if not exists users (
  id uuid primary key,
  email text not null unique,
  name text,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text not null default '',
  color text not null,
  parent_id uuid references projects(id) on delete set null,
  system boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists tags (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text not null default '',
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index if not exists tags_owner_user_id_lower_name_idx on tags (owner_user_id, lower(name));

create table if not exists views (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  name text not null,
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists view_filters (
  view_id uuid primary key references views(id) on delete cascade,
  due text,
  include_project_descendants boolean not null default false,
  query text
);

create table if not exists view_filter_projects (
  view_id uuid not null references views(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  primary key (view_id, project_id)
);

create table if not exists view_filter_tags (
  view_id uuid not null references views(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (view_id, tag_id)
);

create table if not exists view_sorts (
  view_id uuid primary key references views(id) on delete cascade,
  active_key text not null,
  project_direction text not null,
  subject_direction text not null,
  due_direction text not null,
  priority_direction text not null
);

create table if not exists view_display_options (
  view_id uuid primary key references views(id) on delete cascade,
  show_completed boolean not null default false
);

create table if not exists tasks (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  due_date timestamptz,
  priority integer,
  status text not null check (status in ('todo', 'done')),
  completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists task_attachments (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null,
  storage_key text not null,
  created_at timestamptz not null
);

create table if not exists task_comments (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  message text not null,
  created_at timestamptz not null
);

create table if not exists task_comment_attachments (
  id uuid primary key,
  owner_user_id uuid not null references users(id) on delete cascade,
  task_comment_id uuid not null references task_comments(id) on delete cascade,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null,
  storage_key text not null,
  created_at timestamptz not null
);

create table if not exists task_tags (
  task_id uuid not null references tasks(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

create table if not exists reminders (
  id uuid primary key,
  task_id uuid not null references tasks(id) on delete cascade,
  remind_at timestamptz not null
);

create index if not exists projects_owner_user_id_parent_id_idx on projects (owner_user_id, parent_id);
create index if not exists tags_owner_user_id_idx on tags (owner_user_id);
create index if not exists views_owner_user_id_idx on views (owner_user_id);
create index if not exists tasks_owner_user_id_project_id_status_due_date_idx on tasks (owner_user_id, project_id, status, due_date);
create index if not exists task_attachments_task_id_created_at_idx on task_attachments (task_id, created_at);
create index if not exists task_comments_task_id_created_at_idx on task_comments (task_id, created_at);
create index if not exists task_comment_attachments_task_comment_id_created_at_idx on task_comment_attachments (task_comment_id, created_at);
create index if not exists task_tags_tag_id_task_id_idx on task_tags (tag_id, task_id);

"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { FileRevisionMap, Project, ProjectListResponse, Tag, TagListResponse, Task, TaskListResponse, View, ViewListResponse } from "@/types";
import { DONE_PROJECT_ID, INBOX_PROJECT_ID } from "@/lib/utils/system-projects";

type WorkspaceState = {
  projects: Project[];
  tags: Tag[];
  views: View[];
  tasks: TaskListResponse;
  currentView: View | null;
  revisions: FileRevisionMap;
};

const emptyTaskListResponse: TaskListResponse = {
  items: [],
  todoItems: [],
  completedItems: [],
  revisions: {},
};

type ViewDraft = {
  name: string;
  filters: {
    due: "today" | "overdue" | "any" | "none";
    project_ids: string[];
    tag_ids: string[];
    include_project_descendants: boolean;
    query: string;
  };
  sort: {
    field: "due_date" | "created_at" | "updated_at" | "priority" | "title";
    direction: "asc" | "desc";
  };
  display_options: {
    show_completed: boolean;
  };
};

function createDefaultViewDraft(projectId?: string): ViewDraft {
  return {
    name: "",
    filters: {
      due: "any",
      project_ids: projectId ? [projectId] : [],
      tag_ids: [],
      include_project_descendants: Boolean(projectId),
      query: "",
    },
    sort: {
      field: "due_date",
      direction: "asc",
    },
    display_options: {
      show_completed: false,
    },
  };
}

function createViewDraftFromView(view: View): ViewDraft {
  return {
    name: view.name,
    filters: {
      due: view.filters.due ?? "any",
      project_ids: view.filters.project_ids,
      tag_ids: view.filters.tag_ids,
      include_project_descendants: view.filters.include_project_descendants ?? false,
      query: view.filters.query ?? "",
    },
    sort: {
      field: view.sort.field,
      direction: view.sort.direction,
    },
    display_options: {
      show_completed: view.display_options.show_completed,
    },
  };
}

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function toDateTimeLocal(isoValue: string | null | undefined): string {
  if (!isoValue) {
    return "";
  }

  return isoValue.slice(0, 16);
}

function fromDateTimeLocal(localValue: string): string | null {
  if (!localValue) {
    return null;
  }

  return new Date(localValue).toISOString();
}

export function TaskWorkspaceClient({ projectId, viewId }: { projectId?: string; viewId?: string }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceState>({
      projects: [],
      tags: [],
      views: [],
      tasks: emptyTaskListResponse,
      currentView: null,
      revisions: {},
  });
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState("");
  const [taskTagIds, setTaskTagIds] = useState<string[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectColor, setProjectColor] = useState("#ff8080");
  const [tagName, setTagName] = useState("");
  const [viewDraft, setViewDraft] = useState<ViewDraft>(() => createDefaultViewDraft(projectId));
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [projectRename, setProjectRename] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isCompletedCollapsed, setIsCompletedCollapsed] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [shortcutPrefix, setShortcutPrefix] = useState<string | null>(null);
  const createTaskInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const withExpectedRevision = (revisionKey: keyof FileRevisionMap | `task:${string}` | undefined, init?: RequestInit): RequestInit => {
    const headers = new Headers(init?.headers);
    const revision = revisionKey ? workspace.revisions[revisionKey] : undefined;

    if (revision) {
      headers.set("X-Taskit-Revision", revision);
    }

    return {
      ...init,
      headers,
    };
  };

  const withJsonRevision = (revisionKey: keyof FileRevisionMap | `task:${string}` | undefined, init?: RequestInit): RequestInit =>
    withExpectedRevision(revisionKey, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ? Object.fromEntries(new Headers(init.headers).entries()) : {}),
      },
    });

  const refresh = async () => {
    const resolvedProjectId = projectId ?? INBOX_PROJECT_ID;
    const trimmedSearchQuery = searchQuery.trim();
    const taskRequest = viewId
      ? readJson<TaskListResponse>(`/api/views/${viewId}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmedSearchQuery || undefined }),
        })
      : trimmedSearchQuery
        ? readJson<TaskListResponse>(`/api/search?${new URLSearchParams({
            query: trimmedSearchQuery,
            projectId: resolvedProjectId,
            includeCompleted: "true",
          }).toString()}`)
        : readJson<TaskListResponse>(`/api/tasks?projectId=${resolvedProjectId}`);
    const [projects, tags, views, tasks] = await Promise.all([
      readJson<ProjectListResponse>("/api/projects"),
      readJson<TagListResponse>("/api/tags"),
      readJson<ViewListResponse>("/api/views"),
      taskRequest,
    ]);
    const currentView = viewId ? views.views.find((view) => view.id === viewId) ?? null : null;

    setWorkspace({
      projects: projects.projects,
      tags: tags.tags,
      views: views.views,
      tasks,
      currentView,
      revisions: {
        ...projects.revisions,
        ...tags.revisions,
        ...views.revisions,
        ...tasks.revisions,
      },
    });
  };

  useEffect(() => {
    void refresh();
  }, [projectId, searchQuery, viewId]);

  useEffect(() => {
    if (projectId) {
      const currentProject = workspace.projects.find((project) => project.id === projectId);
      setProjectRename(currentProject?.name ?? "");
    }
  }, [projectId, workspace.projects]);

  useEffect(() => {
    if (viewId && workspace.currentView) {
      setViewDraft(createViewDraftFromView(workspace.currentView));
      return;
    }

    setViewDraft(createDefaultViewDraft(projectId));
  }, [projectId, viewId, workspace.currentView]);

  const run = (action: () => Promise<void>) => {
    startTransition(() => {
      void action().catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Unexpected error");
      });
    });
  };

  const resetCreateTaskForm = () => {
    setTaskTitle("");
    setTaskDueDate("");
    setTaskPriority("");
    setTaskTagIds([]);
  };

  const toggleTaskTag = (tagId: string, checked: boolean, target: "create" | "edit") => {
    if (target === "create") {
      setTaskTagIds((current) => (checked ? [...current, tagId] : current.filter((id) => id !== tagId)));
      return;
    }

    setSelectedTask((current) =>
      current
        ? {
            ...current,
            tag_ids: checked ? [...current.tag_ids, tagId] : current.tag_ids.filter((id) => id !== tagId),
          }
        : current,
    );
  };

  const toggleViewFilterId = (target: "project_ids" | "tag_ids", value: string, checked: boolean) => {
    setViewDraft((current) => ({
      ...current,
      filters: {
        ...current.filters,
        [target]: checked
          ? [...current.filters[target], value]
          : current.filters[target].filter((id) => id !== value),
      },
    }));
  };

  const openTaskEditor = (taskId: string) => {
    run(async () => {
      const task = await readJson<Task>(`/api/tasks/${taskId}`);
      setSelectedTask(task);
      setActiveTaskId(taskId);
      setMessage(null);
    });
  };

  const toggleTaskStatus = (task: TaskListResponse["items"][number]) => {
    run(async () => {
      await readJson(`/api/tasks/${task.id}`, {
        ...withJsonRevision(`task:${task.project.id}`, { method: "PATCH" }),
        body: JSON.stringify({
          status: task.status === "done" ? "todo" : "done",
        }),
      });
      await refresh();
      setMessage(task.status === "done" ? "Task reopened" : "Task updated");
    });
  };

  const workspaceLabel = viewId
    ? workspace.currentView?.name ?? "View"
    : projectId
      ? workspace.projects.find((project) => project.id === projectId)?.name ?? "Project"
      : "Inbox";
  const isDoneProjectPage = projectId === DONE_PROJECT_ID;
  const shouldShowCompletedSection = !projectId;
  const visibleTasks = isDoneProjectPage ? workspace.tasks.completedItems : workspace.tasks.todoItems;

  useEffect(() => {
    if (visibleTasks.length === 0) {
      setActiveTaskId(null);
      return;
    }

    if (!activeTaskId || !visibleTasks.some((task) => task.id === activeTaskId)) {
      setActiveTaskId(visibleTasks[0]?.id ?? null);
    }
  }, [activeTaskId, visibleTasks]);

  useEffect(() => {
    if (!shortcutPrefix) {
      return undefined;
    }

    const timer = window.setTimeout(() => setShortcutPrefix(null), 1000);
    return () => window.clearTimeout(timer);
  }, [shortcutPrefix]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName.toLowerCase();
      return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (shortcutPrefix === "g") {
        if (event.key === "i") {
          event.preventDefault();
          setShortcutPrefix(null);
          router.push("/inbox");
          return;
        }

        if (event.key === "d") {
          event.preventDefault();
          setShortcutPrefix(null);
          router.push(`/project/${DONE_PROJECT_ID}`);
          return;
        }
      }

      if (isTypingTarget(event.target)) {
        if (event.key === "/" && searchInputRef.current) {
          event.preventDefault();
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }

        return;
      }

      if (event.key === "q" && createTaskInputRef.current) {
        event.preventDefault();
        createTaskInputRef.current.focus();
        createTaskInputRef.current.select();
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === "g") {
        event.preventDefault();
        setShortcutPrefix("g");
        return;
      }

      const activeTask = visibleTasks.find((task) => task.id === activeTaskId);

      if (event.key === "e" && activeTask) {
        event.preventDefault();
        openTaskEditor(activeTask.id);
        return;
      }

      if (event.key === "x" && activeTask) {
        event.preventDefault();
        toggleTaskStatus(activeTask);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTaskId, router, shortcutPrefix, visibleTasks]);

  return (
    <div className="workspace">
      <aside className="workspace__sidebar">
        <div className="panel">
          <h2>Projects</h2>
          <nav className="list">
            <Link href="/inbox">Inbox</Link>
            {workspace.projects
              .filter((project) => project.id !== INBOX_PROJECT_ID)
              .map((project) => (
                <Link key={project.id} href={`/project/${project.id}`}>
                  {project.name}
                </Link>
              ))}
          </nav>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await readJson("/api/projects", {
                  ...withJsonRevision("project", { method: "POST" }),
                  body: JSON.stringify({
                    name: projectName,
                    color: projectColor,
                  }),
                });
                setProjectName("");
                await refresh();
                setMessage("Project created");
              });
            }}
          >
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="New project" />
            <input value={projectColor} onChange={(event) => setProjectColor(event.target.value)} type="color" />
            <button disabled={isPending || !projectName.trim()} type="submit">
              Add project
            </button>
          </form>
        </div>

        <div className="panel">
          <h2>Tags</h2>
          <ul className="chip-list">
            {workspace.tags.map((tag) => (
              <li key={tag.id} className="chip">
                {tag.name}
                <button
                  type="button"
                  onClick={() =>
                    run(async () => {
                      await fetch(`/api/tags/${tag.id}`, withExpectedRevision("tag", { method: "DELETE" }));
                      await refresh();
                      setMessage("Tag deleted");
                    })
                  }
                >
                  x
                </button>
              </li>
            ))}
          </ul>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await readJson("/api/tags", {
                  ...withJsonRevision("tag", { method: "POST" }),
                  body: JSON.stringify({ name: tagName }),
                });
                setTagName("");
                await refresh();
                setMessage("Tag created");
              });
            }}
          >
            <input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="New tag" />
            <button disabled={isPending || !tagName.trim()} type="submit">
              Add tag
            </button>
          </form>
        </div>

        <div className="panel">
          <h2>Views</h2>
          <ul className="list">
            {workspace.views.map((view) => (
              <li key={view.id}>
                <Link href={`/view/${view.id}`}>{view.name}</Link>
              </li>
            ))}
          </ul>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await readJson("/api/views", {
                  ...withJsonRevision("view", { method: "POST" }),
                  body: JSON.stringify({
                    name: viewDraft.name,
                    filters: {
                      ...viewDraft.filters,
                      query: viewDraft.filters.query.trim() || undefined,
                    },
                    sort: viewDraft.sort,
                    display_options: viewDraft.display_options,
                  }),
                });
                setViewDraft(createDefaultViewDraft(projectId));
                await refresh();
                setMessage("View created");
              });
            }}
          >
            <input
              value={viewDraft.name}
              onChange={(event) => setViewDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="New view"
            />
            <input
              value={viewDraft.filters.query}
              onChange={(event) =>
                setViewDraft((current) => ({
                  ...current,
                  filters: {
                    ...current.filters,
                    query: event.target.value,
                  },
                }))
              }
              placeholder="Filter by text"
            />
            <select
              value={viewDraft.filters.due}
              onChange={(event) =>
                setViewDraft((current) => ({
                  ...current,
                  filters: {
                    ...current.filters,
                    due: event.target.value as ViewDraft["filters"]["due"],
                  },
                }))
              }
            >
              <option value="any">Any due date</option>
              <option value="today">Due today</option>
              <option value="overdue">Overdue</option>
              <option value="none">No due date</option>
            </select>
            <select
              value={`${viewDraft.sort.field}:${viewDraft.sort.direction}`}
              onChange={(event) => {
                const [field, direction] = event.target.value.split(":") as [ViewDraft["sort"]["field"], ViewDraft["sort"]["direction"]];
                setViewDraft((current) => ({
                  ...current,
                  sort: { field, direction },
                }));
              }}
            >
              <option value="due_date:asc">Due date asc</option>
              <option value="due_date:desc">Due date desc</option>
              <option value="priority:desc">Priority desc</option>
              <option value="priority:asc">Priority asc</option>
              <option value="title:asc">Title asc</option>
              <option value="updated_at:desc">Updated desc</option>
            </select>
            <label className="checkbox-item">
              <input
                checked={viewDraft.display_options.show_completed}
                type="checkbox"
                onChange={(event) =>
                  setViewDraft((current) => ({
                    ...current,
                    display_options: {
                      show_completed: event.target.checked,
                    },
                  }))
                }
              />
              <span>Show completed</span>
            </label>
            <label className="checkbox-item">
              <input
                checked={viewDraft.filters.include_project_descendants}
                type="checkbox"
                onChange={(event) =>
                  setViewDraft((current) => ({
                    ...current,
                    filters: {
                      ...current.filters,
                      include_project_descendants: event.target.checked,
                    },
                  }))
                }
              />
              <span>Include child projects</span>
            </label>
            <div className="checkbox-grid">
              {workspace.projects.map((project) => (
                <label key={project.id} className="checkbox-item">
                  <input
                    checked={viewDraft.filters.project_ids.includes(project.id)}
                    type="checkbox"
                    onChange={(event) => toggleViewFilterId("project_ids", project.id, event.target.checked)}
                  />
                  <span>{project.name}</span>
                </label>
              ))}
            </div>
            <div className="checkbox-grid">
              {workspace.tags.map((tag) => (
                <label key={tag.id} className="checkbox-item">
                  <input
                    checked={viewDraft.filters.tag_ids.includes(tag.id)}
                    type="checkbox"
                    onChange={(event) => toggleViewFilterId("tag_ids", tag.id, event.target.checked)}
                  />
                  <span>#{tag.name}</span>
                </label>
              ))}
            </div>
            <button disabled={isPending || !viewDraft.name.trim()} type="submit">
              Add view
            </button>
          </form>
        </div>
      </aside>

      <main className="workspace__main">
        <header className="panel">
          <h1>{viewId ? workspace.currentView?.name ?? "View" : projectId ? "Project" : "Inbox"}</h1>
          {projectId ? (
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await readJson(`/api/projects/${projectId}`, {
                    ...withJsonRevision("project", { method: "PATCH" }),
                    body: JSON.stringify({ name: projectRename }),
                  });
                  await refresh();
                  setMessage("Project updated");
                });
              }}
            >
              <input value={projectRename} onChange={(event) => setProjectRename(event.target.value)} />
              <button disabled={isPending || !projectRename.trim()} type="submit">
                Rename
              </button>
              <button
                disabled={isPending}
                type="button"
                onClick={() =>
                  run(async () => {
                    await fetch(`/api/projects/${projectId}`, withExpectedRevision("project", { method: "DELETE" }));
                    window.location.href = "/inbox";
                  })
                }
              >
                Delete project
              </button>
            </form>
          ) : viewId ? (
            <p>Saved view based on your filters.</p>
          ) : (
            <p>Default project for uncategorized tasks.</p>
          )}
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              setSearchQuery(searchDraft.trim());
            }}
          >
            <input
              ref={searchInputRef}
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search tasks"
            />
            <button disabled={isPending} type="submit">
              Search
            </button>
            <button
              disabled={isPending || (!searchDraft && !searchQuery)}
              type="button"
              onClick={() => {
                setSearchDraft("");
                setSearchQuery("");
              }}
            >
              Clear
            </button>
          </form>
          <p className="section-caption">
            Shortcuts: <code>/</code> search, <code>q</code> new task, <code>e</code> edit selected, <code>x</code> complete or
            reopen, <code>g i</code> inbox, <code>g d</code> done.
          </p>
        </header>

        <section className="panel">
          {!isDoneProjectPage ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await readJson("/api/tasks", {
                    ...withJsonRevision(`task:${projectId ?? INBOX_PROJECT_ID}`, { method: "POST" }),
                    body: JSON.stringify({
                      title: taskTitle,
                      due_date: fromDateTimeLocal(taskDueDate),
                      priority: taskPriority === "" ? null : Number(taskPriority),
                      tag_ids: taskTagIds,
                      project_id: projectId ?? INBOX_PROJECT_ID,
                    }),
                  });
                  resetCreateTaskForm();
                  await refresh();
                  setMessage("Task created");
                });
              }}
            >
              <input ref={createTaskInputRef} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="New task" />
              <input type="datetime-local" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
              <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)}>
                <option value="">Priority</option>
                {Array.from({ length: 10 }, (_, value) => (
                  <option key={value} value={value}>
                    P{value}
                  </option>
                ))}
              </select>
              <div className="checkbox-grid">
                {workspace.tags.map((tag) => (
                  <label key={tag.id} className="checkbox-item">
                    <input
                      checked={taskTagIds.includes(tag.id)}
                      type="checkbox"
                      onChange={(event) => toggleTaskTag(tag.id, event.target.checked, "create")}
                    />
                    <span>{tag.name}</span>
                  </label>
                ))}
              </div>
              <button disabled={isPending || !taskTitle.trim()} type="submit">
                Add task
              </button>
            </form>
          ) : (
            <p>完了したタスクの保管先です。ここでは完了タスクのみ表示します。</p>
          )}
        </section>

        <section className="panel">
          {searchQuery ? <p className="section-caption">Search results for "{searchQuery}"</p> : null}

          <h2 className="section-heading">{`▼ ${workspaceLabel}`}</h2>
          <ul className="task-list">
            {visibleTasks.map((task) => (
              <li
                key={task.id}
                className={`task-row${task.status === "done" ? " task-row--completed" : ""}${activeTaskId === task.id ? " task-row--active" : ""}`}
                onClick={() => setActiveTaskId(task.id)}
              >
                <div>
                  <strong>{task.title}</strong>
                  <div className="task-meta">
                    <span>{task.project.name}</span>
                    {task.dueDate ? <span>Due {new Date(task.dueDate).toLocaleString()}</span> : null}
                    {task.priority !== null ? <span>P{task.priority}</span> : null}
                    {task.tags.map((tag) => (
                      <span key={tag.id}>#{tag.name}</span>
                    ))}
                  </div>
                </div>
                <div className="task-actions">
                  <button
                    type="button"
                    onClick={() => toggleTaskStatus(task)}
                  >
                    {task.status === "done" ? "Reopen" : "Complete"}
                  </button>
                  <button type="button" onClick={() => openTaskEditor(task.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      run(async () => {
                        await fetch(`/api/tasks/${task.id}`, withExpectedRevision(`task:${task.project.id}`, { method: "DELETE" }));
                        setSelectedTask((current) => (current?.id === task.id ? null : current));
                        await refresh();
                        setMessage("Task deleted");
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {isDoneProjectPage
            ? workspace.tasks.completedItems.length === 0 ? <p>No completed tasks.</p> : null
            : workspace.tasks.todoItems.length === 0 ? <p>No open tasks.</p> : null}

          {shouldShowCompletedSection ? (
            <>
              <button
                aria-expanded={!isCompletedCollapsed}
                className="section-toggle"
                type="button"
                onClick={() => setIsCompletedCollapsed((current) => !current)}
              >
                {`${isCompletedCollapsed ? "▶" : "▼"} 完了(${workspace.tasks.completedItems.length}件)`}
              </button>
              {!isCompletedCollapsed ? (
                <>
                  <ul className="task-list">
                    {workspace.tasks.completedItems.map((task) => (
                      <li key={task.id} className="task-row task-row--completed">
                        <div>
                          <strong>{task.title}</strong>
                          <div className="task-meta">
                            <span>{task.project.name}</span>
                            {task.dueDate ? <span>Due {new Date(task.dueDate).toLocaleString()}</span> : null}
                            {task.priority !== null ? <span>P{task.priority}</span> : null}
                            {task.tags.map((tag) => (
                              <span key={tag.id}>#{tag.name}</span>
                            ))}
                          </div>
                        </div>
                        <div className="task-actions">
                          <button
                            type="button"
                            onClick={() =>
                              run(async () => {
                                await readJson(`/api/tasks/${task.id}`, {
                                  ...withJsonRevision(`task:${task.project.id}`, { method: "PATCH" }),
                                  body: JSON.stringify({
                                    status: "todo",
                                  }),
                                });
                                await refresh();
                                setMessage("Task reopened");
                              })
                            }
                          >
                            Reopen
                          </button>
                          <button type="button" onClick={() => openTaskEditor(task.id)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              run(async () => {
                                await fetch(`/api/tasks/${task.id}`, withExpectedRevision(`task:${task.project.id}`, { method: "DELETE" }));
                                setSelectedTask((current) => (current?.id === task.id ? null : current));
                                await refresh();
                                setMessage("Task deleted");
                              })
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {workspace.tasks.completedItems.length === 0 ? <p>No completed tasks.</p> : null}
                </>
              ) : null}
            </>
          ) : null}
        </section>

        {message ? (
          <div className="stack">
            <p className="message">{message}</p>
            {message.toLowerCase().includes("reload") || message.toLowerCase().includes("updated elsewhere") ? (
              <button
                className="button-secondary"
                type="button"
                onClick={() =>
                  run(async () => {
                    await refresh();
                    setMessage("Reloaded latest data");
                  })
                }
              >
                Reload latest data
              </button>
            ) : null}
          </div>
        ) : null}
      </main>

      <section className="workspace__detail">
        <div className="panel">
          <h2>{viewId ? workspace.currentView?.name ?? "View" : selectedTask ? "Edit task" : "Details"}</h2>
          {viewId ? (
            workspace.currentView ? (
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    await readJson(`/api/views/${workspace.currentView?.id}`, {
                      ...withJsonRevision("view", { method: "PATCH" }),
                      body: JSON.stringify({
                        name: viewDraft.name,
                        filters: {
                          ...viewDraft.filters,
                          query: viewDraft.filters.query.trim() || undefined,
                        },
                        sort: viewDraft.sort,
                        display_options: viewDraft.display_options,
                      }),
                    });
                    await refresh();
                    setMessage("View updated");
                  });
                }}
              >
                <input
                  value={viewDraft.name}
                  onChange={(event) => setViewDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="View name"
                />
                <input
                  value={viewDraft.filters.query}
                  onChange={(event) =>
                    setViewDraft((current) => ({
                      ...current,
                      filters: {
                        ...current.filters,
                        query: event.target.value,
                      },
                    }))
                  }
                  placeholder="Text filter"
                />
                <select
                  value={viewDraft.filters.due}
                  onChange={(event) =>
                    setViewDraft((current) => ({
                      ...current,
                      filters: {
                        ...current.filters,
                        due: event.target.value as ViewDraft["filters"]["due"],
                      },
                    }))
                  }
                >
                  <option value="any">Any due date</option>
                  <option value="today">Due today</option>
                  <option value="overdue">Overdue</option>
                  <option value="none">No due date</option>
                </select>
                <select
                  value={`${viewDraft.sort.field}:${viewDraft.sort.direction}`}
                  onChange={(event) => {
                    const [field, direction] = event.target.value.split(":") as [ViewDraft["sort"]["field"], ViewDraft["sort"]["direction"]];
                    setViewDraft((current) => ({
                      ...current,
                      sort: { field, direction },
                    }));
                  }}
                >
                  <option value="due_date:asc">Due date asc</option>
                  <option value="due_date:desc">Due date desc</option>
                  <option value="priority:desc">Priority desc</option>
                  <option value="priority:asc">Priority asc</option>
                  <option value="title:asc">Title asc</option>
                  <option value="updated_at:desc">Updated desc</option>
                </select>
                <label className="checkbox-item">
                  <input
                    checked={viewDraft.display_options.show_completed}
                    type="checkbox"
                    onChange={(event) =>
                      setViewDraft((current) => ({
                        ...current,
                        display_options: {
                          show_completed: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>Show completed</span>
                </label>
                <label className="checkbox-item">
                  <input
                    checked={viewDraft.filters.include_project_descendants}
                    type="checkbox"
                    onChange={(event) =>
                      setViewDraft((current) => ({
                        ...current,
                        filters: {
                          ...current.filters,
                          include_project_descendants: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>Include child projects</span>
                </label>
                <div className="checkbox-grid">
                  {workspace.projects.map((project) => (
                    <label key={project.id} className="checkbox-item">
                      <input
                        checked={viewDraft.filters.project_ids.includes(project.id)}
                        type="checkbox"
                        onChange={(event) => toggleViewFilterId("project_ids", project.id, event.target.checked)}
                      />
                      <span>{project.name}</span>
                    </label>
                  ))}
                </div>
                <div className="checkbox-grid">
                  {workspace.tags.map((tag) => (
                    <label key={tag.id} className="checkbox-item">
                      <input
                        checked={viewDraft.filters.tag_ids.includes(tag.id)}
                        type="checkbox"
                        onChange={(event) => toggleViewFilterId("tag_ids", tag.id, event.target.checked)}
                      />
                      <span>#{tag.name}</span>
                    </label>
                  ))}
                </div>
                <div className="inline-form">
                  <button disabled={isPending || !viewDraft.name.trim()} type="submit">
                    Save view
                  </button>
                  <button
                    className="button-secondary"
                    disabled={isPending}
                    type="button"
                    onClick={() =>
                      run(async () => {
                        await fetch(`/api/views/${workspace.currentView?.id}`, withExpectedRevision("view", { method: "DELETE" }));
                        window.location.href = "/inbox";
                      })
                    }
                  >
                    Delete view
                  </button>
                </div>
              </form>
            ) : (
              <p>View not found.</p>
            )
          ) : selectedTask ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await readJson(`/api/tasks/${selectedTask.id}`, {
                    ...withJsonRevision(`task:${selectedTask.project_id}`, { method: "PATCH" }),
                    body: JSON.stringify({
                      title: selectedTask.title,
                      due_date: selectedTask.due_date,
                      priority: selectedTask.priority,
                      tag_ids: selectedTask.tag_ids,
                      project_id: selectedTask.project_id,
                    }),
                  });
                  await refresh();
                  setMessage("Task updated");
                });
              }}
            >
              <input
                value={selectedTask.title}
                onChange={(event) => setSelectedTask((current) => (current ? { ...current, title: event.target.value } : current))}
              />
              <input
                type="datetime-local"
                value={toDateTimeLocal(selectedTask.due_date)}
                onChange={(event) =>
                  setSelectedTask((current) => (current ? { ...current, due_date: fromDateTimeLocal(event.target.value) } : current))
                }
              />
              <select
                value={selectedTask.priority ?? ""}
                onChange={(event) =>
                  setSelectedTask((current) =>
                    current
                      ? {
                          ...current,
                          priority: event.target.value === "" ? null : Number(event.target.value),
                        }
                      : current,
                  )
                }
              >
                <option value="">Priority</option>
                {Array.from({ length: 10 }, (_, value) => (
                  <option key={value} value={value}>
                    P{value}
                  </option>
                ))}
              </select>
              <div className="checkbox-grid">
                {workspace.tags.map((tag) => (
                  <label key={tag.id} className="checkbox-item">
                    <input
                      checked={selectedTask.tag_ids.includes(tag.id)}
                      type="checkbox"
                      onChange={(event) => toggleTaskTag(tag.id, event.target.checked, "edit")}
                    />
                    <span>{tag.name}</span>
                  </label>
                ))}
              </div>
              <button disabled={isPending || !selectedTask.title.trim()} type="submit">
                Save task
              </button>
            </form>
          ) : (
            <p>Select a task to edit tags, due date, and priority.</p>
          )}
        </div>
      </section>
    </div>
  );
}

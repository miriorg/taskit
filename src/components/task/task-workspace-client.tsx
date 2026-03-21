"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import type { Project, Tag, Task, TaskListResponse, View } from "@/types";
import { INBOX_PROJECT_ID } from "@/lib/utils/system-projects";

type WorkspaceState = {
  projects: Project[];
  tags: Tag[];
  views: View[];
  tasks: TaskListResponse["items"];
};

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

export function TaskWorkspaceClient({ projectId }: { projectId?: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceState>({
    projects: [],
    tags: [],
    views: [],
    tasks: [],
  });
  const [taskTitle, setTaskTitle] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectColor, setProjectColor] = useState("#ff8080");
  const [tagName, setTagName] = useState("");
  const [viewName, setViewName] = useState("");
  const [projectRename, setProjectRename] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = async () => {
    const [projects, tags, views, tasks] = await Promise.all([
      readJson<{ projects: Project[] }>("/api/projects"),
      readJson<{ tags: Tag[] }>("/api/tags"),
      readJson<{ views: View[] }>("/api/views"),
      readJson<TaskListResponse>(projectId ? `/api/tasks?projectId=${projectId}` : `/api/tasks?projectId=${INBOX_PROJECT_ID}`),
    ]);

    setWorkspace({
      projects: projects.projects,
      tags: tags.tags,
      views: views.views,
      tasks: tasks.items,
    });
  };

  useEffect(() => {
    void refresh();
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      const currentProject = workspace.projects.find((project) => project.id === projectId);
      setProjectRename(currentProject?.name ?? "");
    }
  }, [projectId, workspace.projects]);

  const run = (action: () => Promise<void>) => {
    startTransition(() => {
      void action().catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Unexpected error");
      });
    });
  };

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
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
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
                      await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
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
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
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
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: viewName,
                    filters: {
                      project_ids: projectId ? [projectId] : [],
                      tag_ids: [],
                    },
                    sort: {
                      field: "due_date",
                      direction: "asc",
                    },
                    display_options: {
                      show_completed: false,
                    },
                  }),
                });
                setViewName("");
                await refresh();
                setMessage("View created");
              });
            }}
          >
            <input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="New view" />
            <button disabled={isPending || !viewName.trim()} type="submit">
              Add view
            </button>
          </form>
        </div>
      </aside>

      <main className="workspace__main">
        <header className="panel">
          <h1>{projectId ? "Project" : "Inbox"}</h1>
          {projectId ? (
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await readJson(`/api/projects/${projectId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
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
                    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
                    window.location.href = "/inbox";
                  })
                }
              >
                Delete project
              </button>
            </form>
          ) : (
            <p>Default project for uncategorized tasks.</p>
          )}
        </header>

        <section className="panel">
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await readJson("/api/tasks", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: taskTitle,
                    project_id: projectId ?? INBOX_PROJECT_ID,
                  }),
                });
                setTaskTitle("");
                await refresh();
                setMessage("Task created");
              });
            }}
          >
            <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="New task" />
            <button disabled={isPending || !taskTitle.trim()} type="submit">
              Add task
            </button>
          </form>
        </section>

        <section className="panel">
          <ul className="task-list">
            {workspace.tasks.map((task) => (
              <li key={task.id} className="task-row">
                <div>
                  <strong>{task.title}</strong>
                  <div className="task-meta">
                    <span>{task.project.name}</span>
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
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            status: task.status === "done" ? "todo" : "done",
                          }),
                        });
                        await refresh();
                        setMessage("Task updated");
                      })
                    }
                  >
                    {task.status === "done" ? "Reopen" : "Complete"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      run(async () => {
                        await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
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
          {workspace.tasks.length === 0 ? <p>No tasks yet.</p> : null}
        </section>

        {message ? <p className="message">{message}</p> : null}
      </main>
    </div>
  );
}

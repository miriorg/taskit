"use client";

import { useEffect, useState, useTransition } from "react";

import type { Project, ProjectListResponse, Tag, TagListResponse } from "@/types";

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function TestDataGeneratorClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [projectId, setProjectId] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [count, setCount] = useState("5");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => {
      void (async () => {
        try {
          const [projectResponse, tagResponse] = await Promise.all([
            readJson<ProjectListResponse>("/api/projects"),
            readJson<TagListResponse>("/api/tags"),
          ]);
          const availableProjects = projectResponse.projects.filter((project) => !project.system);
          setProjects(availableProjects);
          setTags(tagResponse.tags);
          setProjectId((current) => current || availableProjects[0]?.id || projectResponse.projects[0]?.id || "");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Unexpected error");
        }
      })();
    });
  }, []);

  return (
    <main className="settings-page">
      <section className="panel settings-panel">
        <h1>Test Data Generator</h1>
        <p>既存プロジェクトにランダムなテストタスクをまとめて追加します。Title は同じプロジェクト内で重複しません。</p>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(() => {
              void (async () => {
                try {
                  const response = await readJson<{ tasks: Array<{ id: string }>; projectId: string }>("/api/test-data", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      project_id: projectId,
                      tag_ids: selectedTagIds,
                      count: Number(count),
                    }),
                  });
                  setMessage(`${response.tasks.length} tasks created.`);
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Unexpected error");
                }
              })();
            });
          }}
        >
          <label className="stack">
            <span>Project</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <label className="stack">
            <span>Task count</span>
            <input
              inputMode="numeric"
              max="100"
              min="1"
              type="number"
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </label>

          <div className="stack">
            <span>Candidate tags</span>
            <div className="checkbox-grid">
              {tags.map((tag) => (
                <label key={tag.id} className="checkbox-item">
                  <input
                    checked={selectedTagIds.includes(tag.id)}
                    type="checkbox"
                    onChange={(event) =>
                      setSelectedTagIds((current) =>
                        event.target.checked ? [...current, tag.id] : current.filter((id) => id !== tag.id),
                      )
                    }
                  />
                  <span>{tag.name}</span>
                </label>
              ))}
            </div>
          </div>

          <button disabled={isPending || !projectId || Number(count) < 1} type="submit">
            Generate test tasks
          </button>
        </form>
        {message ? <p className="message">{message}</p> : null}
      </section>
    </main>
  );
}

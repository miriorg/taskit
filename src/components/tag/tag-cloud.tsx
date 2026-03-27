"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { Tag } from "@/types";

type TagCloudProps = {
  tags: Tag[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  inputPlaceholder?: string;
  onCreateTag?: (name: string) => Promise<Tag>;
  focusSignal?: number;
  onRequestClose?: () => void;
  onTagCommitted?: () => void;
};

type TagSuggestion =
  | {
      kind: "tag";
      id: string;
      label: string;
      tagId: string;
    }
  | {
      kind: "create";
      id: string;
      label: string;
      name: string;
    };

function normalizeTagName(name: string) {
  return name.trim().toLowerCase();
}

export function TagCloud({
  tags,
  selectedTagIds,
  onChange,
  inputPlaceholder = "Search tags",
  onCreateTag,
  focusSignal = 0,
  onRequestClose,
  onTagCommitted,
}: TagCloudProps) {
  const [query, setQuery] = useState("");
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedQuery = normalizeTagName(query);

  useEffect(() => {
    if (focusSignal > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusSignal]);

  const selectedTags = useMemo(() => {
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
    return selectedTagIds.map((tagId) => tagsById.get(tagId)).filter((tag): tag is Tag => Boolean(tag));
  }, [selectedTagIds, tags]);

  const suggestions = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    const availableTags = tags.filter((tag) => !selectedTagIds.includes(tag.id));
    const matchingTags: TagSuggestion[] = availableTags
      .filter((tag) => normalizeTagName(tag.name).includes(normalizedQuery))
      .map((tag) => ({
        kind: "tag",
        id: `tag:${tag.id}`,
        label: `#${tag.name}`,
        tagId: tag.id,
      }));
    const hasExactMatch = availableTags.some((tag) => normalizeTagName(tag.name) === normalizedQuery);

    if (!onCreateTag || hasExactMatch) {
      return matchingTags;
    }

    const createSuggestion: TagSuggestion = {
      kind: "create",
      id: `create:${normalizedQuery}`,
      label: `Create #${query.trim()}`,
      name: query.trim(),
    };

    return [
      ...matchingTags,
      createSuggestion,
    ];
  }, [normalizedQuery, onCreateTag, query, selectedTagIds, tags]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
    setCreateError(null);
  }, [query]);

  useEffect(() => {
    if (suggestions.length === 0) {
      setActiveSuggestionIndex(0);
      return;
    }

    setActiveSuggestionIndex((current) => Math.min(current, suggestions.length - 1));
  }, [suggestions]);

  const selectTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      return;
    }

    onChange([...selectedTagIds, tagId]);
    setQuery("");
    setCreateError(null);
    onTagCommitted?.();
  };

  const removeTag = (tagId: string) => {
    onChange(selectedTagIds.filter((currentTagId) => currentTagId !== tagId));
  };

  const commitSuggestion = async (suggestion: TagSuggestion | undefined) => {
    if (!suggestion) {
      return;
    }

    if (suggestion.kind === "tag") {
      selectTag(suggestion.tagId);
      return;
    }

    if (!onCreateTag || isCreatingTag) {
      return;
    }

    try {
      setIsCreatingTag(true);
      setCreateError(null);
      const createdTag = await onCreateTag(suggestion.name);
      onChange([...selectedTagIds, createdTag.id]);
      setQuery("");
      onTagCommitted?.();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create tag");
    } finally {
      setIsCreatingTag(false);
    }
  };

  const activeSuggestion = suggestions[activeSuggestionIndex];
  const activeDescendantId = activeSuggestion ? `${listboxId}-${activeSuggestion.id}` : undefined;

  return (
    <div className="tag-cloud">
      <div className="tag-cloud__control">
        {selectedTags.map((tag) => (
          <button key={tag.id} className="tag-cloud__chip" type="button" onClick={() => removeTag(tag.id)}>
            <span>{`#${tag.name}`}</span>
            <span aria-hidden="true">×</span>
          </button>
        ))}
        <label className="tag-cloud__input-wrap">
          <span aria-hidden="true" className="tag-cloud__icon">
            #
          </span>
          <input
            aria-busy={isCreatingTag}
            aria-activedescendant={activeDescendantId}
            aria-autocomplete="list"
            aria-controls={suggestions.length > 0 ? listboxId : undefined}
            aria-expanded={suggestions.length > 0}
            aria-label="Tag search"
            className="tag-cloud__input"
            placeholder={inputPlaceholder}
            role="combobox"
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && suggestions.length > 0) {
                event.preventDefault();
                setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
                return;
              }

              if (event.key === "ArrowUp" && suggestions.length > 0) {
                event.preventDefault();
                setActiveSuggestionIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
                return;
              }

              if ((event.key === "Enter" || event.key === "Tab") && activeSuggestion) {
                event.preventDefault();
                void commitSuggestion(activeSuggestion);
                return;
              }

              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
                setCreateError(null);
                return;
              }

              if (event.key === "Escape" && !query) {
                event.preventDefault();
                onRequestClose?.();
                return;
              }

              if (event.key === "Backspace" && !query && selectedTags.length > 0) {
                event.preventDefault();
                removeTag(selectedTags[selectedTags.length - 1]!.id);
              }
            }}
          />
        </label>
      </div>

      {suggestions.length > 0 ? (
        <div id={listboxId} className="tag-cloud__suggestions" role="listbox" aria-label="Matching tags">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              id={`${listboxId}-${suggestion.id}`}
              className={`tag-cloud__suggestion${index === activeSuggestionIndex ? " tag-cloud__suggestion--primary" : ""}${
                suggestion.kind === "create" ? " tag-cloud__suggestion--create" : ""
              }`}
              type="button"
              onClick={() => {
                void commitSuggestion(suggestion);
              }}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : null}

      {createError ? <p className="tag-cloud__error">{createError}</p> : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

import type { Tag } from "@/types";

type TagCloudProps = {
  tags: Tag[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  inputPlaceholder?: string;
};

export function TagCloud({ tags, selectedTagIds, onChange, inputPlaceholder = "Search tags" }: TagCloudProps) {
  const [query, setQuery] = useState("");

  const selectedTags = useMemo(() => {
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
    return selectedTagIds.map((tagId) => tagsById.get(tagId)).filter((tag): tag is Tag => Boolean(tag));
  }, [selectedTagIds, tags]);

  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return tags.filter(
      (tag) => !selectedTagIds.includes(tag.id) && tag.name.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [query, selectedTagIds, tags]);

  const selectTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      return;
    }

    onChange([...selectedTagIds, tagId]);
    setQuery("");
  };

  const removeTag = (tagId: string) => {
    onChange(selectedTagIds.filter((currentTagId) => currentTagId !== tagId));
  };

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
            aria-label="Tag search"
            className="tag-cloud__input"
            placeholder={inputPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === "Tab") && suggestions[0]) {
                event.preventDefault();
                selectTag(suggestions[0].id);
                return;
              }

              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
          />
        </label>
      </div>

      {suggestions.length > 0 ? (
        <div className="tag-cloud__suggestions" role="listbox" aria-label="Matching tags">
          {suggestions.map((tag, index) => (
            <button
              key={tag.id}
              className={`tag-cloud__suggestion${index === 0 ? " tag-cloud__suggestion--primary" : ""}`}
              type="button"
              onClick={() => selectTag(tag.id)}
            >
              {`#${tag.name}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

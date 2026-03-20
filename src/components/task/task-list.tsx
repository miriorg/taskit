import type { TaskListItemDto } from "@/types";

export function TaskList({ items }: { items: TaskListItemDto[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.title}</li>
      ))}
    </ul>
  );
}

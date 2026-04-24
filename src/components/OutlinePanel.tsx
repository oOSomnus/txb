import type { OutlineItem } from "../lib/types";

interface OutlinePanelProps {
  outline: OutlineItem[];
  onSelect: (anchor: string) => void;
}

export function OutlinePanel({ outline, onSelect }: OutlinePanelProps) {
  return (
    <aside className="outline-panel" aria-label="Page outline">
      <div className="outline-panel__header">Outline</div>
      {outline.length === 0 ? (
        <p className="outline-panel__empty">No headings on this page.</p>
      ) : (
        <ul className="outline-panel__list">
          {outline.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="outline-panel__item"
                style={{ paddingLeft: `${Math.max(0, item.level - 1) * 0.9 + 0.75}rem` }}
                onClick={() => onSelect(item.anchor)}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

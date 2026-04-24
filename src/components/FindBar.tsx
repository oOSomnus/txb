interface FindBarProps {
  query: string;
  matchCount: number;
  activeMatch: number;
  onQueryChange: (query: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function FindBar({
  query,
  matchCount,
  activeMatch,
  onQueryChange,
  onPrevious,
  onNext,
  onClose,
}: FindBarProps) {
  return (
    <div className="find-bar">
      <label className="find-bar__label" htmlFor="find-query">
        Find
      </label>
      <input
        id="find-query"
        className="find-bar__input"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search this page"
      />
      <span className="find-bar__count">
        {matchCount === 0 ? "No matches" : `${activeMatch + 1} / ${matchCount}`}
      </span>
      <button type="button" className="chrome-button" onClick={onPrevious} disabled={matchCount === 0}>
        Prev
      </button>
      <button type="button" className="chrome-button" onClick={onNext} disabled={matchCount === 0}>
        Next
      </button>
      <button type="button" className="chrome-button chrome-button--ghost" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

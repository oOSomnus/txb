import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  BlockNode,
  FormField,
  FormModel,
  InlineNode,
  SubmitField,
  SubmitFormRequest,
  TextDocument,
} from "../lib/types";

interface DocumentRendererProps {
  document: TextDocument;
  query: string;
  activeMatch: number;
  anchorToReveal: string | null;
  scrollRoot: HTMLDivElement | null;
  onAnchorHandled: () => void;
  onLinkNavigate: (url: string) => void;
  onHoverUrl: (url: string | null) => void;
  onSubmitForm: (request: SubmitFormRequest) => Promise<void>;
}

type FormStateValue = string | boolean;

function buildInitialFormState(form: FormModel): Record<string, FormStateValue> {
  const initial: Record<string, FormStateValue> = {};
  for (const field of form.fields) {
    switch (field.kind) {
      case "text":
      case "textarea":
      case "hidden":
      case "submit":
        initial[field.id] = field.value;
        break;
      case "checkbox":
      case "radio":
        initial[field.id] = field.checked;
        break;
      case "select":
        initial[field.id] = field.options.find((option) => option.selected)?.value ?? field.options[0]?.value ?? "";
        break;
    }
  }
  return initial;
}

function collectSubmissionValues(
  form: FormModel,
  state: Record<string, FormStateValue>,
  submitter?: SubmitField,
): SubmitFormRequest["values"] {
  const values: SubmitFormRequest["values"] = [];

  for (const field of form.fields) {
    if (!field.name) {
      continue;
    }

    switch (field.kind) {
      case "text":
      case "textarea":
      case "hidden":
        values.push({ name: field.name, value: String(state[field.id] ?? field.value) });
        break;
      case "checkbox":
        if (Boolean(state[field.id])) {
          values.push({ name: field.name, value: field.value });
        }
        break;
      case "radio":
        if (Boolean(state[field.id])) {
          values.push({ name: field.name, value: field.value });
        }
        break;
      case "select":
        values.push({ name: field.name, value: String(state[field.id] ?? "") });
        break;
      case "submit":
        break;
    }
  }

  if (submitter?.name) {
    values.push({ name: submitter.name, value: submitter.value });
  }

  return values;
}

function FormView({
  form,
  onSubmit,
}: {
  form: FormModel;
  onSubmit: (request: SubmitFormRequest) => Promise<void>;
}) {
  const [state, setState] = useState<Record<string, FormStateValue>>(() => buildInitialFormState(form));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setState(buildInitialFormState(form));
  }, [form]);

  const visibleFields = useMemo(
    () => form.fields.filter((field) => field.kind !== "hidden"),
    [form.fields],
  );

  async function submit(submitter?: SubmitField) {
    setSubmitting(true);
    try {
      await onSubmit({
        method: form.method,
        action: form.action,
        enctype: form.enctype,
        values: collectSubmissionValues(form, state, submitter),
      });
    } finally {
      setSubmitting(false);
    }
  }

  function updateField(field: FormField, value: FormStateValue) {
    setState((current) => {
      if (field.kind === "radio") {
        const next = { ...current };
        for (const candidate of form.fields) {
          if (candidate.kind === "radio" && candidate.name === field.name) {
            next[candidate.id] = candidate.id === field.id ? value : false;
          }
        }
        return next;
      }
      return { ...current, [field.id]: value };
    });
  }

  return (
    <form
      className="document-form"
      onSubmit={(event) => {
        event.preventDefault();
        const firstSubmit = form.fields.find((field): field is SubmitField => field.kind === "submit");
        void submit(firstSubmit);
      }}
    >
      <div className="document-form__meta">
        <span>{form.method.toUpperCase()}</span>
        <span>{form.action}</span>
      </div>
      {visibleFields.length === 0 ? <p className="document-form__empty">This form only carries hidden fields.</p> : null}
      {visibleFields.map((field) => {
        switch (field.kind) {
          case "text":
            return (
              <label key={field.id} className="field field--stack">
                <span className="field__label">{field.label || field.name || "Text field"}</span>
                <input
                  className="field__input"
                  type={field.inputType}
                  value={String(state[field.id] ?? "")}
                  placeholder={field.placeholder ?? ""}
                  onChange={(event) => updateField(field, event.target.value)}
                />
              </label>
            );
          case "textarea":
            return (
              <label key={field.id} className="field field--stack">
                <span className="field__label">{field.label || field.name || "Text area"}</span>
                <textarea
                  className="field__textarea"
                  rows={field.rows ?? 4}
                  value={String(state[field.id] ?? "")}
                  placeholder={field.placeholder ?? ""}
                  onChange={(event) => updateField(field, event.target.value)}
                />
              </label>
            );
          case "checkbox":
            return (
              <label key={field.id} className="field field--inline">
                <input
                  type="checkbox"
                  checked={Boolean(state[field.id])}
                  onChange={(event) => updateField(field, event.target.checked)}
                />
                <span className="field__label">{field.label || field.name || field.value}</span>
              </label>
            );
          case "radio":
            return (
              <label key={field.id} className="field field--inline">
                <input
                  type="radio"
                  name={field.name}
                  checked={Boolean(state[field.id])}
                  onChange={(event) => updateField(field, event.target.checked)}
                />
                <span className="field__label">{field.label || field.name || field.value}</span>
              </label>
            );
          case "select":
            return (
              <label key={field.id} className="field field--stack">
                <span className="field__label">{field.label || field.name || "Selection"}</span>
                <select
                  className="field__select"
                  value={String(state[field.id] ?? "")}
                  onChange={(event) => updateField(field, event.target.value)}
                >
                  {field.options.map((option) => (
                    <option key={`${field.id}-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          case "submit":
            return (
              <button
                key={field.id}
                type="button"
                className="document-link document-link--button"
                onClick={() => void submit(field)}
                disabled={submitting}
              >
                {field.value || "Submit"}
              </button>
            );
        }
      })}
      {form.fields.every((field) => field.kind !== "submit") ? (
        <button type="submit" className="document-link document-link--button" disabled={submitting}>
          Submit
        </button>
      ) : null}
    </form>
  );
}

export function DocumentRenderer({
  document,
  query,
  activeMatch,
  anchorToReveal,
  scrollRoot,
  onAnchorHandled,
  onLinkNavigate,
  onHoverUrl,
  onSubmitForm,
}: DocumentRendererProps) {
  useEffect(() => {
    if (!query || activeMatch < 0 || !scrollRoot) {
      return;
    }
    const target = scrollRoot.querySelector<HTMLElement>(`[data-match-index="${activeMatch}"]`);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeMatch, query, scrollRoot, document.url]);

  useEffect(() => {
    if (!anchorToReveal || !scrollRoot) {
      return;
    }
    const escaped = typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(anchorToReveal) : anchorToReveal;
    const target =
      scrollRoot.querySelector<HTMLElement>(`[data-anchor="${escaped}"]`) ??
      scrollRoot.querySelector<HTMLElement>(`#${escaped}`);
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
    onAnchorHandled();
  }, [anchorToReveal, scrollRoot, onAnchorHandled, document.url]);

  let matchCursor = 0;
  const normalizedQuery = query.trim().toLowerCase();

  function renderTextWithHighlights(text: string) {
    if (!normalizedQuery) {
      return text;
    }

    const lowerText = text.toLowerCase();
    const fragments: ReactNode[] = [];
    let cursor = 0;

    while (cursor < text.length) {
      const matchIndex = lowerText.indexOf(normalizedQuery, cursor);
      if (matchIndex === -1) {
        fragments.push(text.slice(cursor));
        break;
      }

      if (matchIndex > cursor) {
        fragments.push(text.slice(cursor, matchIndex));
      }

      const nextIndex = matchCursor;
      matchCursor += 1;
      fragments.push(
        <mark
          key={`match-${nextIndex}-${matchIndex}`}
          data-match-index={nextIndex}
          className={nextIndex === activeMatch ? "search-match search-match--active" : "search-match"}
        >
          {text.slice(matchIndex, matchIndex + normalizedQuery.length)}
        </mark>,
      );
      cursor = matchIndex + normalizedQuery.length;
    }

    return fragments;
  }

  function renderInline(inline: InlineNode, key: string): ReactNode {
    switch (inline.kind) {
      case "text":
        return <span key={key}>{renderTextWithHighlights(inline.text)}</span>;
      case "code":
        return (
          <code key={key} className="inline-code">
            {renderTextWithHighlights(inline.text)}
          </code>
        );
      case "strong":
        return <strong key={key}>{inline.children.map((child, index) => renderInline(child, `${key}-${index}`))}</strong>;
      case "emphasis":
        return <em key={key}>{inline.children.map((child, index) => renderInline(child, `${key}-${index}`))}</em>;
      case "imageAlt":
        return (
          <span key={key} className="inline-image">
            [{renderTextWithHighlights(inline.text)}]
          </span>
        );
      case "link":
        return (
          <button
            key={key}
            type="button"
            className="document-link"
            onClick={() => onLinkNavigate(inline.href)}
            onMouseEnter={() => onHoverUrl(inline.href)}
            onMouseLeave={() => onHoverUrl(null)}
            title={inline.title ?? inline.href}
          >
            {renderTextWithHighlights(inline.text)}
            <span className="document-link__index">[{inline.linkId}]</span>
          </button>
        );
    }
  }

  function renderBlock(block: BlockNode): ReactNode {
    const commonProps = {
      key: block.id,
      "data-block-id": block.id,
      "data-anchor": block.anchor ?? undefined,
      id: block.anchor ?? undefined,
    };

    switch (block.kind) {
      case "paragraph":
        return (
          <p {...commonProps} className="document-block document-paragraph">
            {block.inlines.map((inline, index) => renderInline(inline, `${block.id}-${index}`))}
          </p>
        );
      case "heading": {
        const contents = block.inlines.map((inline, index) => renderInline(inline, `${block.id}-${index}`));
        switch (Math.min(6, Math.max(1, block.level))) {
          case 1:
            return (
              <h1 {...commonProps} className="document-block document-heading document-heading--1">
                {contents}
              </h1>
            );
          case 2:
            return (
              <h2 {...commonProps} className="document-block document-heading document-heading--2">
                {contents}
              </h2>
            );
          case 3:
            return (
              <h3 {...commonProps} className="document-block document-heading document-heading--3">
                {contents}
              </h3>
            );
          case 4:
            return (
              <h4 {...commonProps} className="document-block document-heading document-heading--4">
                {contents}
              </h4>
            );
          case 5:
            return (
              <h5 {...commonProps} className="document-block document-heading document-heading--5">
                {contents}
              </h5>
            );
          default:
            return (
              <h6 {...commonProps} className="document-block document-heading document-heading--6">
                {contents}
              </h6>
            );
        }
      }
      case "list":
        return block.ordered ? (
          <ol {...commonProps} className="document-block document-list">
            {block.items.map((item, index) => (
              <li key={`${block.id}-${index}`}>{item.blocks.map(renderBlock)}</li>
            ))}
          </ol>
        ) : (
          <ul {...commonProps} className="document-block document-list">
            {block.items.map((item, index) => (
              <li key={`${block.id}-${index}`}>{item.blocks.map(renderBlock)}</li>
            ))}
          </ul>
        );
      case "quote":
        return (
          <blockquote {...commonProps} className="document-block document-quote">
            {block.blocks.map(renderBlock)}
          </blockquote>
        );
      case "codeBlock":
        return (
          <pre {...commonProps} className="document-block document-code">
            <code>{renderTextWithHighlights(block.text)}</code>
          </pre>
        );
      case "preformatted":
        return (
          <pre {...commonProps} className="document-block document-preformatted">
            {renderTextWithHighlights(block.text)}
          </pre>
        );
      case "table":
        return (
          <div {...commonProps} className="document-block table-wrap">
            <table className="document-table">
              {block.headers.length > 0 ? (
                <thead>
                  <tr>
                    {block.headers.map((cell, index) => (
                      <th key={`${block.id}-header-${index}`}>
                        {cell.inlines.map((inline, inlineIndex) =>
                          renderInline(inline, `${block.id}-header-${index}-${inlineIndex}`),
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={`${block.id}-row-${rowIndex}`}>
                    {row.cells.map((cell, cellIndex) => (
                      <td key={`${block.id}-row-${rowIndex}-cell-${cellIndex}`}>
                        {cell.inlines.map((inline, inlineIndex) =>
                          renderInline(inline, `${block.id}-row-${rowIndex}-cell-${cellIndex}-${inlineIndex}`),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "horizontalRule":
        return <hr {...commonProps} className="document-block document-rule" />;
      case "image":
        return (
          <div {...commonProps} className="document-block document-image">
            [{renderTextWithHighlights(block.alt || "image")}]
          </div>
        );
      case "form":
        return (
          <section {...commonProps} className="document-block document-form-wrap">
            <FormView form={block.form} onSubmit={onSubmitForm} />
          </section>
        );
      case "notice":
        return (
          <aside {...commonProps} className={`document-block document-notice document-notice--${block.tone}`}>
            {renderTextWithHighlights(block.message)}
          </aside>
        );
    }
  }

  return (
    <article className="document" aria-label={document.title}>
      {document.pageNotice ? <div className="page-notice">{document.pageNotice}</div> : null}
      {document.blocks.map(renderBlock)}
    </article>
  );
}

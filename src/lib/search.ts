import type { BlockNode, InlineNode } from "./types";

export function countMatchesInDocument(blocks: BlockNode[], query: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return 0;
  }

  return blocks.reduce((total, block) => total + countMatchesInBlock(block, needle), 0);
}

function countMatchesInBlock(block: BlockNode, needle: string): number {
  switch (block.kind) {
    case "paragraph":
    case "heading":
      return countMatchesInInlines(block.inlines, needle);
    case "list":
      return block.items.reduce(
        (total, item) =>
          total + item.blocks.reduce((innerTotal, inner) => innerTotal + countMatchesInBlock(inner, needle), 0),
        0,
      );
    case "quote":
      return block.blocks.reduce((total, inner) => total + countMatchesInBlock(inner, needle), 0);
    case "table":
      return [...block.headers, ...block.rows.flatMap((row) => row.cells)].reduce(
        (total, cell) => total + countMatchesInInlines(cell.inlines, needle),
        0,
      );
    case "codeBlock":
    case "preformatted":
      return countMatchesInText(block.text, needle);
    case "image":
      return countMatchesInText(block.alt, needle);
    case "form":
      return block.form.fields.reduce((total, field) => {
        const labelCount = countMatchesInText(field.label ?? "", needle);
        if ("value" in field) {
          return total + labelCount + countMatchesInText(String(field.value), needle);
        }
        if (field.kind === "select") {
          return (
            total +
            labelCount +
            field.options.reduce(
              (optionTotal, option) =>
                optionTotal +
                countMatchesInText(option.label, needle) +
                countMatchesInText(option.value, needle),
              0,
            )
          );
        }
        return total + labelCount;
      }, 0);
    case "notice":
      return countMatchesInText(block.message, needle);
    case "horizontalRule":
      return 0;
  }
}

function countMatchesInInlines(inlines: InlineNode[], needle: string): number {
  return inlines.reduce((total, inline) => {
    switch (inline.kind) {
      case "text":
      case "code":
      case "link":
      case "imageAlt":
        return total + countMatchesInText(inline.text, needle);
      case "strong":
      case "emphasis":
        return total + countMatchesInInlines(inline.children, needle);
    }
  }, 0);
}

function countMatchesInText(text: string, needle: string): number {
  const haystack = text.toLowerCase();
  if (!needle || !haystack) {
    return 0;
  }

  let count = 0;
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index === -1) {
      break;
    }
    count += 1;
    cursor = index + needle.length;
  }
  return count;
}

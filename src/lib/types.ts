export interface InlineTextNode {
  kind: "text";
  text: string;
}

export interface InlineStrongNode {
  kind: "strong";
  children: InlineNode[];
}

export interface InlineEmphasisNode {
  kind: "emphasis";
  children: InlineNode[];
}

export interface InlineCodeNode {
  kind: "code";
  text: string;
}

export interface InlineLinkNode {
  kind: "link";
  text: string;
  href: string;
  linkId: number;
  title?: string | null;
}

export interface InlineImageAltNode {
  kind: "imageAlt";
  text: string;
  src?: string | null;
}

export type InlineNode =
  | InlineTextNode
  | InlineStrongNode
  | InlineEmphasisNode
  | InlineCodeNode
  | InlineLinkNode
  | InlineImageAltNode;

export interface LinkTarget {
  id: number;
  href: string;
  label: string;
  title?: string | null;
}

export interface SelectOption {
  label: string;
  value: string;
  selected: boolean;
}

interface BaseField {
  id: string;
  name: string;
  label?: string | null;
}

export interface TextField extends BaseField {
  kind: "text";
  value: string;
  placeholder?: string | null;
  inputType: "text" | "search" | "password";
}

export interface CheckboxField extends BaseField {
  kind: "checkbox";
  value: string;
  checked: boolean;
}

export interface RadioField extends BaseField {
  kind: "radio";
  value: string;
  checked: boolean;
}

export interface TextAreaField extends BaseField {
  kind: "textarea";
  value: string;
  placeholder?: string | null;
  rows?: number | null;
}

export interface SelectField extends BaseField {
  kind: "select";
  options: SelectOption[];
}

export interface HiddenField extends BaseField {
  kind: "hidden";
  value: string;
}

export interface SubmitField extends BaseField {
  kind: "submit";
  value: string;
}

export type FormField =
  | TextField
  | CheckboxField
  | RadioField
  | TextAreaField
  | SelectField
  | HiddenField
  | SubmitField;

export interface FormModel {
  id: string;
  method: string;
  action: string;
  enctype?: string | null;
  fields: FormField[];
}

export interface OutlineItem {
  id: string;
  level: number;
  title: string;
  anchor: string;
}

export interface DocumentMetadata {
  contentType: string;
  loadTimeMs: number;
  redirected: boolean;
  redirectChain: string[];
}

export interface ListItem {
  blocks: BlockNode[];
}

export interface TableCell {
  inlines: InlineNode[];
}

export interface TableRow {
  cells: TableCell[];
}

interface BaseBlock {
  id: string;
  anchor?: string | null;
}

export interface ParagraphBlock extends BaseBlock {
  kind: "paragraph";
  inlines: InlineNode[];
}

export interface HeadingBlock extends BaseBlock {
  kind: "heading";
  level: number;
  inlines: InlineNode[];
}

export interface ListBlock extends BaseBlock {
  kind: "list";
  ordered: boolean;
  items: ListItem[];
}

export interface QuoteBlock extends BaseBlock {
  kind: "quote";
  blocks: BlockNode[];
}

export interface CodeBlock extends BaseBlock {
  kind: "codeBlock";
  text: string;
}

export interface PreformattedBlock extends BaseBlock {
  kind: "preformatted";
  text: string;
}

export interface TableBlock extends BaseBlock {
  kind: "table";
  headers: TableCell[];
  rows: TableRow[];
}

export interface HorizontalRuleBlock extends BaseBlock {
  kind: "horizontalRule";
}

export interface ImageBlock extends BaseBlock {
  kind: "image";
  alt: string;
  src?: string | null;
}

export interface FormBlock extends BaseBlock {
  kind: "form";
  form: FormModel;
}

export interface NoticeBlock extends BaseBlock {
  kind: "notice";
  tone: "info" | "warning" | "error";
  message: string;
}

export type BlockNode =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | QuoteBlock
  | CodeBlock
  | PreformattedBlock
  | TableBlock
  | HorizontalRuleBlock
  | ImageBlock
  | FormBlock
  | NoticeBlock;

export interface TextDocument {
  url: string;
  title: string;
  statusCode: number;
  blocks: BlockNode[];
  links: LinkTarget[];
  forms: FormModel[];
  outline: OutlineItem[];
  metadata: DocumentMetadata;
  pageNotice?: string | null;
}

export interface HistoryEntry {
  document: TextDocument;
  scrollTop: number;
}

export interface SubmissionValue {
  name: string;
  value: string;
}

export interface SubmitFormRequest {
  method: string;
  action: string;
  enctype?: string | null;
  values: SubmissionValue[];
}

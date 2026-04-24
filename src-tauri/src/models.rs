use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDocument {
    pub url: String,
    pub title: String,
    pub status_code: u16,
    pub blocks: Vec<BlockNode>,
    pub links: Vec<LinkTarget>,
    pub forms: Vec<FormModel>,
    pub outline: Vec<OutlineItem>,
    pub metadata: DocumentMetadata,
    pub page_notice: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkTarget {
    pub id: usize,
    pub href: String,
    pub label: String,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineItem {
    pub id: String,
    pub level: u8,
    pub title: String,
    pub anchor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMetadata {
    pub content_type: String,
    pub load_time_ms: u64,
    pub redirected: bool,
    pub redirect_chain: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListItem {
    pub blocks: Vec<BlockNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableCell {
    pub inlines: Vec<InlineNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableRow {
    pub cells: Vec<TableCell>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BlockNode {
    Paragraph {
        id: String,
        anchor: Option<String>,
        inlines: Vec<InlineNode>,
    },
    Heading {
        id: String,
        anchor: Option<String>,
        level: u8,
        inlines: Vec<InlineNode>,
    },
    List {
        id: String,
        anchor: Option<String>,
        ordered: bool,
        items: Vec<ListItem>,
    },
    Quote {
        id: String,
        anchor: Option<String>,
        blocks: Vec<BlockNode>,
    },
    CodeBlock {
        id: String,
        anchor: Option<String>,
        text: String,
    },
    Preformatted {
        id: String,
        anchor: Option<String>,
        text: String,
    },
    Table {
        id: String,
        anchor: Option<String>,
        headers: Vec<TableCell>,
        rows: Vec<TableRow>,
    },
    HorizontalRule {
        id: String,
        anchor: Option<String>,
    },
    Image {
        id: String,
        anchor: Option<String>,
        alt: String,
        src: Option<String>,
    },
    Form {
        id: String,
        anchor: Option<String>,
        form: FormModel,
    },
    Notice {
        id: String,
        anchor: Option<String>,
        tone: NoticeTone,
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NoticeTone {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum InlineNode {
    Text {
        text: String,
    },
    Strong {
        children: Vec<InlineNode>,
    },
    Emphasis {
        children: Vec<InlineNode>,
    },
    Code {
        text: String,
    },
    Link {
        text: String,
        href: String,
        link_id: usize,
        title: Option<String>,
    },
    ImageAlt {
        text: String,
        src: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormModel {
    pub id: String,
    pub method: String,
    pub action: String,
    pub enctype: Option<String>,
    pub fields: Vec<FormField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectOption {
    pub label: String,
    pub value: String,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FormField {
    Text {
        id: String,
        name: String,
        label: Option<String>,
        value: String,
        placeholder: Option<String>,
        input_type: String,
    },
    Checkbox {
        id: String,
        name: String,
        label: Option<String>,
        value: String,
        checked: bool,
    },
    Radio {
        id: String,
        name: String,
        label: Option<String>,
        value: String,
        checked: bool,
    },
    Textarea {
        id: String,
        name: String,
        label: Option<String>,
        value: String,
        placeholder: Option<String>,
        rows: Option<u32>,
    },
    Select {
        id: String,
        name: String,
        label: Option<String>,
        options: Vec<SelectOption>,
    },
    Hidden {
        id: String,
        name: String,
        label: Option<String>,
        value: String,
    },
    Submit {
        id: String,
        name: String,
        label: Option<String>,
        value: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitFormRequest {
    pub method: String,
    pub action: String,
    pub enctype: Option<String>,
    pub values: Vec<SubmissionValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionValue {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone)]
pub struct ParsedDocument {
    pub title: String,
    pub blocks: Vec<BlockNode>,
    pub links: Vec<LinkTarget>,
    pub forms: Vec<FormModel>,
    pub outline: Vec<OutlineItem>,
    pub page_notice: Option<String>,
}

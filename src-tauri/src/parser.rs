use std::collections::HashSet;

use pulldown_cmark::{html, Options, Parser as MarkdownParser};
use scraper::{node::Node, ElementRef, Html, Selector};
use url::Url;

use crate::models::{
    BlockNode, FormField, FormModel, InlineNode, LinkTarget, ListItem, NoticeTone, OutlineItem,
    ParsedDocument, SelectOption, TableCell, TableRow,
};

pub fn parse_html(base_url: &Url, source: &str) -> ParsedDocument {
    let document = Html::parse_document(source);
    let body_selector = Selector::parse("body").expect("body selector");
    let html_selector = Selector::parse("html").expect("html selector");
    let title_selector = Selector::parse("title").expect("title selector");
    let script_selector = Selector::parse("script").expect("script selector");

    let title = document
        .select(&title_selector)
        .next()
        .map(text_content)
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| title_from_url(base_url));

    let root = document
        .select(&body_selector)
        .next()
        .or_else(|| document.select(&html_selector).next());

    let mut context = ParseContext::new(base_url.clone());
    let mut blocks = root
        .map(|root| parse_children(root, &mut context))
        .unwrap_or_default();

    if blocks.is_empty() {
        blocks.push(BlockNode::Notice {
            id: context.next_block_id("notice"),
            anchor: None,
            tone: NoticeTone::Warning,
            message: "No readable text content was found on this page.".to_string(),
        });
    }

    let script_count = document.select(&script_selector).count();
    let page_notice = if script_count >= 6 && count_meaningful_blocks(&blocks) <= 2 {
        Some("This page appears to rely on JavaScript; plain-text fallback shown.".to_string())
    } else {
        None
    };

    ParsedDocument {
        title,
        blocks,
        links: context.links,
        forms: context.forms,
        outline: context.outline,
        page_notice,
    }
}

pub fn parse_markdown(base_url: &Url, source: &str) -> ParsedDocument {
    let options = Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TABLES
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_TASKLISTS;
    let parser = MarkdownParser::new_ext(source, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    parse_html(base_url, &html_output)
}

pub fn parse_plain_text(base_url: &Url, source: &str) -> ParsedDocument {
    let mut context = ParseContext::new(base_url.clone());
    ParsedDocument {
        title: title_from_url(base_url),
        blocks: vec![BlockNode::Preformatted {
            id: context.next_block_id("pre"),
            anchor: None,
            text: source.to_string(),
        }],
        links: Vec::new(),
        forms: Vec::new(),
        outline: Vec::new(),
        page_notice: None,
    }
}

struct ParseContext {
    base_url: Url,
    block_counter: usize,
    field_counter: usize,
    next_link_id: usize,
    links: Vec<LinkTarget>,
    forms: Vec<FormModel>,
    outline: Vec<OutlineItem>,
    used_anchors: HashSet<String>,
}

impl ParseContext {
    fn new(base_url: Url) -> Self {
        Self {
            base_url,
            block_counter: 0,
            field_counter: 0,
            next_link_id: 1,
            links: Vec::new(),
            forms: Vec::new(),
            outline: Vec::new(),
            used_anchors: HashSet::new(),
        }
    }

    fn next_block_id(&mut self, prefix: &str) -> String {
        self.block_counter += 1;
        format!("{prefix}-{}", self.block_counter)
    }

    fn next_field_id(&mut self, prefix: &str) -> String {
        self.field_counter += 1;
        format!("{prefix}-{}", self.field_counter)
    }

    fn register_link(&mut self, href: String, label: String, title: Option<String>) -> usize {
        let next_id = self.next_link_id;
        self.next_link_id += 1;
        self.links.push(LinkTarget {
            id: next_id,
            href,
            label,
            title,
        });
        next_id
    }

    fn register_outline(
        &mut self,
        title: String,
        level: u8,
        preferred_anchor: Option<String>,
    ) -> String {
        let base_anchor = preferred_anchor
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| slugify(&title));
        let mut anchor = if base_anchor.is_empty() {
            self.next_block_id("section")
        } else {
            base_anchor
        };

        if self.used_anchors.contains(&anchor) {
            let mut suffix = 2;
            while self.used_anchors.contains(&format!("{anchor}-{suffix}")) {
                suffix += 1;
            }
            anchor = format!("{anchor}-{suffix}");
        }

        self.used_anchors.insert(anchor.clone());
        self.outline.push(OutlineItem {
            id: format!("outline-{}", self.outline.len() + 1),
            level,
            title,
            anchor: anchor.clone(),
        });
        anchor
    }
}

fn parse_children(parent: ElementRef<'_>, context: &mut ParseContext) -> Vec<BlockNode> {
    let mut blocks = Vec::new();
    let mut inline_buffer = Vec::new();

    for child in parent.children() {
        match child.value() {
            Node::Text(text) => {
                let normalized = collapse_whitespace(text.text.as_ref());
                if !normalized.is_empty() {
                    inline_buffer.push(InlineNode::Text { text: normalized });
                }
            }
            Node::Element(_) => {
                if let Some(element) = ElementRef::wrap(child) {
                    let tag = element.value().name();
                    if is_block_level(tag) {
                        flush_inline_buffer(&mut blocks, &mut inline_buffer, context);
                        blocks.extend(parse_element_as_blocks(element, context));
                    } else if tag == "br" {
                        inline_buffer.push(InlineNode::Text {
                            text: "\n".to_string(),
                        });
                    } else {
                        inline_buffer.extend(parse_inline_children(element, context));
                    }
                }
            }
            _ => {}
        }
    }

    flush_inline_buffer(&mut blocks, &mut inline_buffer, context);
    blocks
}

fn flush_inline_buffer(
    blocks: &mut Vec<BlockNode>,
    inline_buffer: &mut Vec<InlineNode>,
    context: &mut ParseContext,
) {
    if inline_buffer.is_empty() {
        return;
    }

    if inline_buffer.iter().all(is_empty_inline) {
        inline_buffer.clear();
        return;
    }

    blocks.push(BlockNode::Paragraph {
        id: context.next_block_id("paragraph"),
        anchor: None,
        inlines: std::mem::take(inline_buffer),
    });
}

fn parse_element_as_blocks(element: ElementRef<'_>, context: &mut ParseContext) -> Vec<BlockNode> {
    let tag = element.value().name();
    match tag {
        "p" => vec![BlockNode::Paragraph {
            id: context.next_block_id("paragraph"),
            anchor: anchor_from_attr(&element),
            inlines: parse_inline_children(element, context),
        }],
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
            let level = tag[1..].parse::<u8>().unwrap_or(1);
            let text = text_content(element);
            let anchor = context.register_outline(text.clone(), level, anchor_from_attr(&element));
            vec![BlockNode::Heading {
                id: context.next_block_id("heading"),
                anchor: Some(anchor),
                level,
                inlines: parse_inline_children(element, context),
            }]
        }
        "ul" | "ol" => {
            let items = element
                .children()
                .filter_map(ElementRef::wrap)
                .filter(|child| child.value().name() == "li")
                .map(|item| {
                    let mut blocks = parse_children(item, context);
                    if blocks.is_empty() {
                        blocks.push(BlockNode::Paragraph {
                            id: context.next_block_id("paragraph"),
                            anchor: None,
                            inlines: vec![InlineNode::Text {
                                text: text_content(item),
                            }],
                        });
                    }
                    ListItem { blocks }
                })
                .collect::<Vec<_>>();
            vec![BlockNode::List {
                id: context.next_block_id("list"),
                anchor: anchor_from_attr(&element),
                ordered: tag == "ol",
                items,
            }]
        }
        "blockquote" => vec![BlockNode::Quote {
            id: context.next_block_id("quote"),
            anchor: anchor_from_attr(&element),
            blocks: parse_children(element, context),
        }],
        "pre" => {
            let text = element.text().collect::<Vec<_>>().join("");
            vec![BlockNode::CodeBlock {
                id: context.next_block_id("code"),
                anchor: anchor_from_attr(&element),
                text,
            }]
        }
        "table" => vec![parse_table(element, context)],
        "hr" => vec![BlockNode::HorizontalRule {
            id: context.next_block_id("rule"),
            anchor: anchor_from_attr(&element),
        }],
        "img" => vec![BlockNode::Image {
            id: context.next_block_id("image"),
            anchor: anchor_from_attr(&element),
            alt: element.value().attr("alt").unwrap_or("image").to_string(),
            src: resolve_attr_url(context, &element, "src"),
        }],
        "form" => vec![parse_form(element, context)],
        "article" | "section" | "main" | "div" | "body" | "html" | "header" | "footer"
        | "aside" | "nav" => parse_children(element, context),
        _ => {
            let inlines = parse_inline_children(element, context);
            if inlines.is_empty() {
                Vec::new()
            } else {
                vec![BlockNode::Paragraph {
                    id: context.next_block_id("paragraph"),
                    anchor: anchor_from_attr(&element),
                    inlines,
                }]
            }
        }
    }
}

fn parse_inline_children(element: ElementRef<'_>, context: &mut ParseContext) -> Vec<InlineNode> {
    let mut nodes = Vec::new();
    for child in element.children() {
        match child.value() {
            Node::Text(text) => {
                let normalized = collapse_whitespace(text.text.as_ref());
                if !normalized.is_empty() {
                    nodes.push(InlineNode::Text { text: normalized });
                }
            }
            Node::Element(_) => {
                if let Some(child_element) = ElementRef::wrap(child) {
                    nodes.extend(parse_inline_element(child_element, context));
                }
            }
            _ => {}
        }
    }
    nodes
}

fn parse_inline_element(element: ElementRef<'_>, context: &mut ParseContext) -> Vec<InlineNode> {
    match element.value().name() {
        "strong" | "b" => vec![InlineNode::Strong {
            children: parse_inline_children(element, context),
        }],
        "em" | "i" => vec![InlineNode::Emphasis {
            children: parse_inline_children(element, context),
        }],
        "code" => vec![InlineNode::Code {
            text: element
                .text()
                .collect::<Vec<_>>()
                .join("")
                .trim()
                .to_string(),
        }],
        "a" => {
            let href = element
                .value()
                .attr("href")
                .and_then(|href| context.base_url.join(href).ok().map(|url| url.to_string()))
                .unwrap_or_else(|| context.base_url.to_string());
            let label = {
                let label = text_content(element);
                if label.is_empty() {
                    href.clone()
                } else {
                    label
                }
            };
            let title = element.value().attr("title").map(str::to_string);
            let link_id = context.register_link(href.clone(), label.clone(), title.clone());
            vec![InlineNode::Link {
                text: label,
                href,
                link_id,
                title,
            }]
        }
        "img" => vec![InlineNode::ImageAlt {
            text: element.value().attr("alt").unwrap_or("image").to_string(),
            src: resolve_attr_url(context, &element, "src"),
        }],
        "br" => vec![InlineNode::Text {
            text: "\n".to_string(),
        }],
        _ => parse_inline_children(element, context),
    }
}

fn parse_table(element: ElementRef<'_>, context: &mut ParseContext) -> BlockNode {
    let row_selector = Selector::parse("tr").expect("tr selector");
    let cell_selector = Selector::parse("th, td").expect("cell selector");
    let mut headers = Vec::new();
    let mut rows = Vec::new();

    for row in element.select(&row_selector) {
        let mut cells = Vec::new();
        let mut header_only = true;

        for cell in row.select(&cell_selector) {
            if cell.value().name() != "th" {
                header_only = false;
            }
            cells.push(TableCell {
                inlines: parse_inline_children(cell, context),
            });
        }

        if cells.is_empty() {
            continue;
        }

        if header_only && headers.is_empty() {
            headers = cells;
        } else {
            rows.push(TableRow { cells });
        }
    }

    BlockNode::Table {
        id: context.next_block_id("table"),
        anchor: anchor_from_attr(&element),
        headers,
        rows,
    }
}

fn parse_form(element: ElementRef<'_>, context: &mut ParseContext) -> BlockNode {
    let form_id = element
        .value()
        .attr("id")
        .map(str::to_string)
        .unwrap_or_else(|| context.next_block_id("form"));
    let method = element
        .value()
        .attr("method")
        .unwrap_or("get")
        .to_ascii_lowercase();
    let action = element
        .value()
        .attr("action")
        .and_then(|action| {
            context
                .base_url
                .join(action)
                .ok()
                .map(|url| url.to_string())
        })
        .unwrap_or_else(|| context.base_url.to_string());
    let enctype = element.value().attr("enctype").map(str::to_string);
    let mut fields = Vec::new();

    for node in element.descendants() {
        let Some(field_element) = ElementRef::wrap(node) else {
            continue;
        };

        match field_element.value().name() {
            "input" => {
                let field_type = field_element
                    .value()
                    .attr("type")
                    .unwrap_or("text")
                    .to_ascii_lowercase();
                let name = field_element.value().attr("name").unwrap_or("").to_string();
                let id = field_element
                    .value()
                    .attr("id")
                    .map(str::to_string)
                    .unwrap_or_else(|| context.next_field_id("field"));
                let label = find_field_label(field_element);
                let placeholder = field_element
                    .value()
                    .attr("placeholder")
                    .map(str::to_string);
                let value = field_element
                    .value()
                    .attr("value")
                    .unwrap_or("")
                    .to_string();
                let checked = field_element.value().attr("checked").is_some();

                let form_field = match field_type.as_str() {
                    "text" | "search" | "password" => Some(FormField::Text {
                        id,
                        name,
                        label,
                        value,
                        placeholder,
                        input_type: field_type,
                    }),
                    "checkbox" => Some(FormField::Checkbox {
                        id,
                        name,
                        label,
                        value: if value.is_empty() {
                            "on".to_string()
                        } else {
                            value
                        },
                        checked,
                    }),
                    "radio" => Some(FormField::Radio {
                        id,
                        name,
                        label,
                        value: if value.is_empty() {
                            "on".to_string()
                        } else {
                            value
                        },
                        checked,
                    }),
                    "hidden" => Some(FormField::Hidden {
                        id,
                        name,
                        label,
                        value,
                    }),
                    "submit" => Some(FormField::Submit {
                        id,
                        name,
                        label,
                        value: if value.is_empty() {
                            "Submit".to_string()
                        } else {
                            value
                        },
                    }),
                    _ => None,
                };

                if let Some(field) = form_field {
                    fields.push(field);
                }
            }
            "textarea" => {
                let id = field_element
                    .value()
                    .attr("id")
                    .map(str::to_string)
                    .unwrap_or_else(|| context.next_field_id("field"));
                let name = field_element.value().attr("name").unwrap_or("").to_string();
                let placeholder = field_element
                    .value()
                    .attr("placeholder")
                    .map(str::to_string);
                let rows = field_element
                    .value()
                    .attr("rows")
                    .and_then(|value| value.parse::<u32>().ok());
                fields.push(FormField::Textarea {
                    id,
                    name,
                    label: find_field_label(field_element),
                    value: field_element
                        .text()
                        .collect::<Vec<_>>()
                        .join("")
                        .trim()
                        .to_string(),
                    placeholder,
                    rows,
                });
            }
            "select" => {
                let id = field_element
                    .value()
                    .attr("id")
                    .map(str::to_string)
                    .unwrap_or_else(|| context.next_field_id("field"));
                let name = field_element.value().attr("name").unwrap_or("").to_string();
                let option_selector = Selector::parse("option").expect("option selector");
                let options = field_element
                    .select(&option_selector)
                    .map(|option| SelectOption {
                        label: text_content(option),
                        value: option.value().attr("value").unwrap_or("").to_string(),
                        selected: option.value().attr("selected").is_some(),
                    })
                    .collect::<Vec<_>>();
                fields.push(FormField::Select {
                    id,
                    name,
                    label: find_field_label(field_element),
                    options,
                });
            }
            "button" => {
                let button_type = field_element.value().attr("type").unwrap_or("submit");
                if button_type.eq_ignore_ascii_case("submit") {
                    let id = field_element
                        .value()
                        .attr("id")
                        .map(str::to_string)
                        .unwrap_or_else(|| context.next_field_id("field"));
                    fields.push(FormField::Submit {
                        id,
                        name: field_element.value().attr("name").unwrap_or("").to_string(),
                        label: find_field_label(field_element),
                        value: {
                            let text = text_content(field_element);
                            if text.is_empty() {
                                "Submit".to_string()
                            } else {
                                text
                            }
                        },
                    });
                }
            }
            _ => {}
        }
    }

    let model = FormModel {
        id: form_id.clone(),
        method,
        action,
        enctype,
        fields,
    };
    context.forms.push(model.clone());

    BlockNode::Form {
        id: context.next_block_id("form"),
        anchor: Some(form_id),
        form: model,
    }
}

fn resolve_attr_url(
    context: &ParseContext,
    element: &ElementRef<'_>,
    attribute: &str,
) -> Option<String> {
    element
        .value()
        .attr(attribute)
        .and_then(|value| context.base_url.join(value).ok().map(|url| url.to_string()))
}

fn anchor_from_attr(element: &ElementRef<'_>) -> Option<String> {
    element.value().attr("id").map(str::to_string)
}

fn is_block_level(tag: &str) -> bool {
    matches!(
        tag,
        "p" | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "ul"
            | "ol"
            | "blockquote"
            | "pre"
            | "table"
            | "hr"
            | "img"
            | "form"
            | "article"
            | "section"
            | "main"
            | "div"
            | "body"
            | "html"
            | "header"
            | "footer"
            | "aside"
            | "nav"
    )
}

fn is_empty_inline(node: &InlineNode) -> bool {
    match node {
        InlineNode::Text { text } | InlineNode::Code { text } => text.trim().is_empty(),
        InlineNode::Strong { children } | InlineNode::Emphasis { children } => {
            children.iter().all(is_empty_inline)
        }
        InlineNode::Link { text, .. } | InlineNode::ImageAlt { text, .. } => text.trim().is_empty(),
    }
}

fn text_content(element: ElementRef<'_>) -> String {
    collapse_whitespace(&element.text().collect::<Vec<_>>().join(" "))
}

fn collapse_whitespace(text: &str) -> String {
    let mut output = String::new();
    let mut last_was_whitespace = false;

    for character in text.chars() {
        if character.is_whitespace() {
            if !last_was_whitespace {
                output.push(' ');
            }
            last_was_whitespace = true;
        } else {
            output.push(character);
            last_was_whitespace = false;
        }
    }

    output.trim().to_string()
}

fn slugify(text: &str) -> String {
    let mut output = String::new();
    let mut previous_dash = false;

    for character in text.chars() {
        if character.is_ascii_alphanumeric() {
            output.push(character.to_ascii_lowercase());
            previous_dash = false;
        } else if !previous_dash {
            output.push('-');
            previous_dash = true;
        }
    }

    output.trim_matches('-').to_string()
}

fn title_from_url(url: &Url) -> String {
    url.path_segments()
        .and_then(|segments| segments.last())
        .filter(|segment| !segment.is_empty())
        .map(|segment| segment.replace('-', " "))
        .unwrap_or_else(|| url.host_str().unwrap_or("Untitled").to_string())
}

fn count_meaningful_blocks(blocks: &[BlockNode]) -> usize {
    blocks
        .iter()
        .map(|block| match block {
            BlockNode::Paragraph { .. }
            | BlockNode::Heading { .. }
            | BlockNode::List { .. }
            | BlockNode::Quote { .. }
            | BlockNode::CodeBlock { .. }
            | BlockNode::Preformatted { .. }
            | BlockNode::Table { .. }
            | BlockNode::Image { .. }
            | BlockNode::Form { .. } => 1,
            BlockNode::HorizontalRule { .. } | BlockNode::Notice { .. } => 0,
        })
        .sum()
}

fn find_field_label(element: ElementRef<'_>) -> Option<String> {
    for ancestor in element.ancestors() {
        let Some(ancestor_element) = ElementRef::wrap(ancestor) else {
            continue;
        };
        if ancestor_element.value().name() == "label" {
            let text = text_content(ancestor_element);
            if !text.is_empty() {
                return Some(text);
            }
        }
    }

    element
        .value()
        .attr("aria-label")
        .or_else(|| element.value().attr("placeholder"))
        .or_else(|| element.value().attr("name"))
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_headings_links_and_lists() {
        let url = Url::parse("https://example.com/docs").unwrap();
        let parsed = parse_html(
            &url,
            r#"
            <html>
              <head><title>Example Docs</title></head>
              <body>
                <h1 id="intro">Getting Started</h1>
                <p>Hello <a href="/next">world</a>.</p>
                <ul>
                  <li>First</li>
                  <li>Second</li>
                </ul>
              </body>
            </html>
            "#,
        );

        assert_eq!(parsed.title, "Example Docs");
        assert_eq!(parsed.outline.len(), 1);
        assert_eq!(parsed.links.len(), 1);
        assert_eq!(parsed.links[0].href, "https://example.com/next");
        assert!(matches!(parsed.blocks[0], BlockNode::Heading { .. }));
        assert!(matches!(parsed.blocks[2], BlockNode::List { .. }));
    }

    #[test]
    fn parses_forms_and_serializes_options() {
        let url = Url::parse("https://example.com/search").unwrap();
        let parsed = parse_html(
            &url,
            r#"
            <form action="/search" method="get">
              <label>Query <input type="search" name="q" value="rust"></label>
              <input type="checkbox" name="safe" value="1" checked>
              <select name="scope">
                <option value="all">All</option>
                <option value="docs" selected>Docs</option>
              </select>
              <button type="submit">Go</button>
            </form>
            "#,
        );

        assert_eq!(parsed.forms.len(), 1);
        let form = &parsed.forms[0];
        assert_eq!(form.action, "https://example.com/search");
        assert!(form
            .fields
            .iter()
            .any(|field| matches!(field, FormField::Text { name, .. } if name == "q")));
        assert!(form.fields.iter().any(|field| matches!(field, FormField::Checkbox { name, checked, .. } if name == "safe" && *checked)));
        assert!(form.fields.iter().any(|field| matches!(field, FormField::Select { name, options, .. } if name == "scope" && options.iter().any(|option| option.value == "docs" && option.selected))));
    }

    #[test]
    fn tolerates_malformed_html() {
        let url = Url::parse("https://example.com").unwrap();
        let parsed = parse_html(&url, "<h1>Open <em>tag");
        assert!(!parsed.blocks.is_empty());
    }
}

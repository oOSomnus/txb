use std::{sync::Arc, time::Instant};

use reqwest::{
    cookie::Jar,
    header::{HeaderValue, CONTENT_TYPE, USER_AGENT},
    Client,
};
use url::Url;

use crate::{
    models::{
        BlockNode, DocumentMetadata, NoticeTone, ParsedDocument, SubmissionValue,
        SubmitFormRequest, TextDocument,
    },
    parser,
};

#[derive(Clone)]
pub struct BrowserEngine {
    client: Client,
}

impl BrowserEngine {
    pub fn new() -> Result<Self, String> {
        let jar = Arc::new(Jar::default());
        let mut default_headers = reqwest::header::HeaderMap::new();
        default_headers.insert(
            USER_AGENT,
            HeaderValue::from_static("TextBrowser/0.1 (+https://example.com/plain-text)"),
        );
        let client = Client::builder()
            .default_headers(default_headers)
            .cookie_provider(jar)
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .map_err(|error| error.to_string())?;
        Ok(Self { client })
    }

    pub async fn open_location(&self, input: &str) -> Result<TextDocument, String> {
        let normalized = normalize_location_input(input);
        if has_unsupported_scheme(&normalized) {
            return Ok(build_notice_document(
                normalized,
                400,
                "Unsupported URL scheme. This browser only opens http and https locations in v1.",
                "application/problem+json",
                0,
                Vec::new(),
            ));
        }
        self.fetch_url(&normalized).await
    }

    pub async fn submit_form(&self, request: SubmitFormRequest) -> Result<TextDocument, String> {
        let started_at = Instant::now();
        let method = request.method.to_ascii_uppercase();
        let target = if request.action.is_empty() {
            return Err("Form action cannot be empty".to_string());
        } else {
            request.action
        };

        let url = Url::parse(&target).map_err(|error| error.to_string())?;
        let response = if method == "POST" {
            self.client
                .post(url.clone())
                .header(
                    CONTENT_TYPE,
                    request
                        .enctype
                        .unwrap_or_else(|| "application/x-www-form-urlencoded".to_string()),
                )
                .body(serialize_pairs(&request.values))
                .send()
                .await
                .map_err(|error| error.to_string())?
        } else {
            let mut next_url = url.clone();
            let query = serialize_pairs(&request.values);
            if !query.is_empty() {
                next_url.set_query(Some(&query));
            }
            self.client
                .get(next_url)
                .send()
                .await
                .map_err(|error| error.to_string())?
        };

        self.response_to_document(target, response, started_at)
            .await
    }

    async fn fetch_url(&self, target: &str) -> Result<TextDocument, String> {
        let started_at = Instant::now();
        let response = self
            .client
            .get(target)
            .send()
            .await
            .map_err(|error| error.to_string())?;
        self.response_to_document(target.to_string(), response, started_at)
            .await
    }

    async fn response_to_document(
        &self,
        requested_url: String,
        response: reqwest::Response,
        started_at: Instant,
    ) -> Result<TextDocument, String> {
        let status_code = response.status().as_u16();
        let final_url = response.url().clone();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();
        let body = response.bytes().await.map_err(|error| error.to_string())?;
        let text_body = String::from_utf8_lossy(&body).to_string();
        let load_time_ms = started_at.elapsed().as_millis() as u64;
        let redirect_chain = if requested_url != final_url.as_str() {
            vec![requested_url.clone(), final_url.to_string()]
        } else {
            Vec::new()
        };

        let parsed = if is_html(&content_type) {
            parser::parse_html(&final_url, &text_body)
        } else if is_markdown(&content_type, &final_url) {
            parser::parse_markdown(&final_url, &text_body)
        } else if is_plain_text(&content_type) {
            parser::parse_plain_text(&final_url, &text_body)
        } else {
            return Ok(build_notice_document(
                final_url.to_string(),
                status_code,
                &format!(
                    "This content type is not rendered in the text surface yet: {}",
                    content_type
                ),
                &content_type,
                load_time_ms,
                redirect_chain,
            ));
        };

        Ok(build_document(
            final_url.to_string(),
            status_code,
            content_type,
            load_time_ms,
            redirect_chain,
            parsed,
        ))
    }
}

pub fn serialize_pairs(values: &[SubmissionValue]) -> String {
    serde_urlencoded::to_string(
        values
            .iter()
            .map(|pair| (&pair.name, &pair.value))
            .collect::<Vec<_>>(),
    )
    .unwrap_or_default()
}

fn build_document(
    url: String,
    status_code: u16,
    content_type: String,
    load_time_ms: u64,
    redirect_chain: Vec<String>,
    parsed: ParsedDocument,
) -> TextDocument {
    TextDocument {
        url,
        title: parsed.title,
        status_code,
        blocks: parsed.blocks,
        links: parsed.links,
        forms: parsed.forms,
        outline: parsed.outline,
        metadata: DocumentMetadata {
            content_type,
            load_time_ms,
            redirected: !redirect_chain.is_empty(),
            redirect_chain,
        },
        page_notice: parsed.page_notice,
    }
}

fn build_notice_document(
    url: String,
    status_code: u16,
    message: &str,
    content_type: &str,
    load_time_ms: u64,
    redirect_chain: Vec<String>,
) -> TextDocument {
    TextDocument {
        title: "Unsupported Content".to_string(),
        url,
        status_code,
        links: Vec::new(),
        forms: Vec::new(),
        outline: Vec::new(),
        blocks: vec![BlockNode::Notice {
            id: "notice-1".to_string(),
            anchor: None,
            tone: NoticeTone::Warning,
            message: message.to_string(),
        }],
        metadata: DocumentMetadata {
            content_type: content_type.to_string(),
            load_time_ms,
            redirected: !redirect_chain.is_empty(),
            redirect_chain,
        },
        page_notice: None,
    }
}

fn is_html(content_type: &str) -> bool {
    content_type.contains("text/html") || content_type.contains("application/xhtml+xml")
}

fn is_plain_text(content_type: &str) -> bool {
    content_type.starts_with("text/plain")
}

fn is_markdown(content_type: &str, url: &Url) -> bool {
    content_type.contains("markdown")
        || url.path().ends_with(".md")
        || url.path().ends_with(".markdown")
}

fn normalize_location_input(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return "https://example.com".to_string();
    }

    if Url::parse(trimmed).is_ok() {
        return trimmed.to_string();
    }

    if trimmed.starts_with("//") {
        return format!("https:{trimmed}");
    }

    let looks_like_host = trimmed.contains('.')
        || trimmed.starts_with("localhost")
        || trimmed.starts_with("127.0.0.1")
        || trimmed.contains('/');

    if trimmed.contains(' ') || !looks_like_host {
        let encoded_query: String =
            url::form_urlencoded::byte_serialize(trimmed.as_bytes()).collect();
        format!("https://duckduckgo.com/html/?q={}", encoded_query)
    } else {
        format!("https://{trimmed}")
    }
}

fn has_unsupported_scheme(url: &str) -> bool {
    Url::parse(url)
        .map(|url| !matches!(url.scheme(), "http" | "https"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_form_pairs() {
        let encoded = serialize_pairs(&[
            SubmissionValue {
                name: "q".to_string(),
                value: "rust browser".to_string(),
            },
            SubmissionValue {
                name: "safe".to_string(),
                value: "1".to_string(),
            },
        ]);

        assert_eq!(encoded, "q=rust+browser&safe=1");
    }

    #[test]
    fn normalizes_search_queries() {
        let normalized = normalize_location_input("plain text browser");
        assert!(normalized.starts_with("https://duckduckgo.com/html/?q="));
    }
}

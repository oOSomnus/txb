mod browser;
mod models;
mod parser;

use browser::BrowserEngine;
use models::{SubmitFormRequest, TextDocument};
use tauri::State;

struct AppState {
    browser: BrowserEngine,
}

#[tauri::command]
async fn open_location(state: State<'_, AppState>, input: String) -> Result<TextDocument, String> {
    state.browser.open_location(&input).await
}

#[tauri::command]
async fn submit_form(
    state: State<'_, AppState>,
    request: SubmitFormRequest,
) -> Result<TextDocument, String> {
    state.browser.submit_form(request).await
}

pub fn run() {
    let browser = BrowserEngine::new().expect("failed to initialize browser engine");

    tauri::Builder::default()
        .manage(AppState { browser })
        .invoke_handler(tauri::generate_handler![open_location, submit_form])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

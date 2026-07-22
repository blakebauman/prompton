mod agent;
mod commands;
mod db;
mod error;
mod history;
mod migrate;
mod prompts;
mod secrets;
mod skills;
mod state;

use std::path::PathBuf;

use tauri::Manager;

use crate::migrate::migrate_legacy_app_data;
use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from(".prompton-data"));
            // Bundle id rename: pull forward connections/history/demo from the old dir.
            let _ = migrate_legacy_app_data(&data_dir);
            let state = AppState::new(data_dir.clone());

            let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../skills");
            let _ = state.skills.ensure_defaults(&bundled);

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_connections,
            commands::connect_db,
            commands::reconnect_db,
            commands::disconnect_db,
            commands::remove_connection,
            commands::list_schemas,
            commands::describe_table,
            commands::run_query,
            commands::request_write_approval,
            commands::confirm_write,
            commands::set_connection_production,
            commands::set_admin_writes_unlocked,
            commands::cancel_query,
            commands::fetch_query_page,
            commands::explain_query,
            commands::agent_chat,
            commands::agent_cancel,
            commands::agent_confirm,
            commands::agent_get_settings,
            commands::agent_set_settings,
            commands::agent_last_context,
            commands::list_skills,
            commands::get_skill,
            commands::save_skill,
            commands::list_prompts,
            commands::save_prompt,
            commands::delete_prompt,
            commands::list_history,
            commands::get_history,
            commands::record_history,
            commands::delete_history,
            commands::clear_history,
            commands::get_provider_kinds,
            commands::default_provider_config,
            commands::list_ollama_models,
            commands::open_demo_sqlite,
            commands::app_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Prompton");
}

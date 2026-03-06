mod db;
mod models;
mod ollama;
mod server;

use std::sync::Arc;
use tauri::{Manager, Listener};
use db::Database;
use ollama::OllamaClient;

/// Shared application state
pub struct AppState {
    pub db: Arc<Database>,
    pub ollama: Arc<OllamaClient>,
    pub shutdown_tx: Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
}

use tauri::tray::TrayIconBuilder;
use tauri::menu::{Menu, MenuItem};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Enable autostart by default using auto-launch
            let app_name = app.package_info().name.clone();
            let app_path = std::env::current_exe().unwrap().to_string_lossy().to_string();
            
            tauri::async_runtime::spawn(async move {
                let auto = auto_launch::AutoLaunchBuilder::new()
                    .set_app_name(&app_name)
                    .set_app_path(&app_path)
                    .set_use_launch_agent(true)
                    .build();
                
                if let Ok(auto) = auto {
                    if !auto.is_enabled().unwrap_or(false) {
                        let _ = auto.enable();
                    }
                }
            });

            // Data directory
            let app_data = app.path().app_data_dir().expect("Failed to get app data dir");
            let data_dir = app_data.join("data");

            // Initialize database
            let db = Arc::new(Database::new(&data_dir)
                .expect("Failed to initialize database"));

            // Get API Token
            let api_token = db.get_setting("api_token")
                .unwrap_or_else(|_| "unknown".to_string());

            // Initialize Ollama client
            let ollama = Arc::new(OllamaClient::new());

            // Start extension HTTP server in background
            let db_clone = db.clone();
            let ollama_clone = ollama.clone();
            let (tx, rx) = tokio::sync::oneshot::channel::<()>();
            tauri::async_runtime::spawn(async move {
                server::start_extension_server(db_clone, ollama_clone, rx).await;
            });

            // Handle shutdown signal
            let _handle = app.handle().clone();
            app.listen("tauri://destroyed", move |_| {
                // This doesn't catch everything, but it's a start
                // Better: Use a state object or just rely on OS killing the process
            });
            
            // Store tx in a way we can access on exit
            // For now, we'll just use a simple approach: if the app exits, the runtime stops anyway.
            // But we can trigger it explicitly in the menu event for "Quit"
            
            // Set app state
            app.manage(AppState { db, ollama, shutdown_tx: Arc::new(std::sync::Mutex::new(Some(tx))) });

            // Create System Tray
            let copy_i = MenuItem::with_id(app, "copy_token", "Copy API Token", true, None::<&str>).unwrap();
            let quit_i = MenuItem::with_id(app, "quit", "Quit Internet Memory", true, None::<&str>).unwrap();
            let menu = Menu::with_items(app, &[&copy_i, &quit_i]).unwrap();

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Internet Memory Server")
                .on_menu_event(move |app, event| {
                    if event.id.as_ref() == "quit" {
                        let state = app.state::<AppState>();
                        if let Ok(mut stx) = state.shutdown_tx.lock() {
                            if let Some(tx) = stx.take() {
                                let _ = tx.send(());
                            }
                        }
                        app.exit(0);
                    } else if event.id.as_ref() == "copy_token" {
                        use tauri_plugin_clipboard_manager::ClipboardExt;
                        let _ = app.clipboard().write_text(api_token.clone());
                    }
                })
                .build(app)
                .unwrap();

            Ok(())
        })
        // Keep app running without windows
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Prevent exit when window closes (if any ever opens)
                api.prevent_close();
                window.hide().unwrap();
            }
        })
        .build(tauri::generate_context!())
        .expect("error building Internet Memory")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit(); // Wait for actual quit from tray
            }
        });
}

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod server;

use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Manager, WebviewUrl, WebviewWindow,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};

const RELEASES: &str = "https://github.com/cokice/japanese-analyzer/releases/latest";

#[derive(Default)]
struct Updates(Mutex<Option<Update>>);

// Custom commands are also checked here: the HTTP app has no native bridge privileges.
fn authorize(window: &WebviewWindow, server: &server::Server) -> Result<(), String> {
    let url = window.url().map_err(|e| e.to_string())?;
    let home = &server.asset_url;
    if ["main", "desktop-settings"].contains(&window.label())
        && url.scheme() == home.scheme()
        && url.host_str() == home.host_str()
        && url.port_or_known_default() == home.port_or_known_default()
    {
        Ok(())
    } else {
        Err("Native commands are only available to packaged desktop pages.".into())
    }
}

#[tauri::command]
fn server_status(
    window: WebviewWindow,
    server: tauri::State<server::Server>,
) -> Result<server::Status, String> {
    authorize(&window, &server)?;
    Ok(server.status())
}

#[tauri::command]
fn restart_server(
    window: WebviewWindow,
    server: tauri::State<server::Server>,
) -> Result<(), String> {
    authorize(&window, &server)?;
    server.restart()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    current_version: String,
    version: Option<String>,
    notes: Option<String>,
    can_install: bool,
}

async fn find_update(app: &tauri::AppHandle) -> Result<UpdateInfo, String> {
    let update = app
        .updater_builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let info = UpdateInfo {
        current_version: app.package_info().version.to_string(),
        version: update.as_ref().map(|u| u.version.clone()),
        notes: update.as_ref().and_then(|u| u.body.clone()),
        can_install: cfg!(target_os = "macos"),
    };
    if let Some(menu) = app.menu() {
        if let Some(item) = menu
            .get("desktop-settings")
            .and_then(|item| item.as_menuitem().cloned())
        {
            let _ = item.set_text(if update.is_some() {
                "桌面设置 · 有新版本 / Update available…"
            } else {
                "桌面设置 / Desktop settings…"
            });
        }
    }
    *app.state::<Updates>().0.lock().unwrap() = update;
    Ok(info)
}

#[tauri::command]
async fn check_update(window: WebviewWindow, app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    authorize(&window, &app.state::<server::Server>())?;
    find_update(&app).await
}

#[tauri::command]
async fn install_update(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    authorize(&window, &app.state::<server::Server>())?;
    #[cfg(target_os = "macos")]
    {
        let update = app
            .state::<Updates>()
            .0
            .lock()
            .unwrap()
            .take()
            .ok_or("Please check for updates first.")?;
        let bytes = update
            .download(|_, _| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
        app.state::<server::Server>().pause()?;
        if let Err(error) = update.install(bytes) {
            let _ = app.state::<server::Server>().restart();
            return Err(format!("Update failed: {error}. The server is restarting."));
        }
        app.restart();
    }
    #[cfg(not(target_os = "macos"))]
    Err("Download and run the full Windows installer from Releases.".into())
}

#[tauri::command]
fn open_releases(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    authorize(&window, &app.state::<server::Server>())?;
    app.opener()
        .open_url(RELEASES, None::<&str>)
        .map_err(|e| e.to_string())
}

fn settings(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("desktop-settings") {
        let _ = window.set_focus();
        return;
    }
    let result = tauri::WebviewWindowBuilder::new(
        app,
        "desktop-settings",
        WebviewUrl::App("index.html?settings=1".into()),
    )
    .title("桌面设置 / Desktop settings")
    .inner_size(640.0, 620.0)
    .min_inner_size(560.0, 480.0)
    .build();
    if let Err(error) = result {
        eprintln!("Could not open desktop settings: {error}");
    }
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(Updates::default())
        .invoke_handler(tauri::generate_handler![
            server_status,
            restart_server,
            check_update,
            install_update,
            open_releases
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            ctrlc::set_handler(move || handle.exit(0))?;
            let window = app.get_webview_window("main").expect("main window");
            app.manage(server::Server::start(app.handle().clone(), window.url()?)?);
            // Preserve the platform's standard editing shortcuts and application menu.
            let menu = Menu::default(app.handle())?;
            let desktop_settings = MenuItem::with_id(
                app,
                "desktop-settings",
                "桌面设置 / Desktop settings…",
                true,
                Some("CmdOrCtrl+,"),
            )?;
            let desktop = Submenu::with_items(
                app,
                "桌面 / Desktop",
                true,
                &[
                    &desktop_settings,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?;
            menu.append(&desktop)?;
            app.set_menu(menu)?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Offline use and first releases without an update manifest remain functional.
                let _ = find_update(&handle).await;
            });
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "desktop-settings" {
                settings(app);
            }
        })
        .on_window_event(|window, event| {
            if window.label() == "main"
                && matches!(event, tauri::WindowEvent::CloseRequested { .. })
            {
                // Closing the primary window exits even while desktop settings are open.
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("Could not initialize Japanese Analyzer desktop");
    app.run(|app, event| {
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            app.state::<server::Server>().stop();
        }
    });
}

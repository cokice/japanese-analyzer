#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod navigation;
mod server;

use serde::Serialize;
use std::sync::Mutex;
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Manager, WebviewUrl, WebviewWindow};
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
async fn server_status(
    window: WebviewWindow,
    server: tauri::State<'_, server::Server>,
) -> Result<server::Status, String> {
    authorize(&window, &server)?;
    Ok(server.status())
}

#[tauri::command]
async fn restart_server(
    window: WebviewWindow,
    server: tauri::State<'_, server::Server>,
) -> Result<(), String> {
    authorize(&window, &server)?;
    server.restart()
}

#[tauri::command]
async fn reassign_port(
    window: WebviewWindow,
    server: tauri::State<'_, server::Server>,
) -> Result<(), String> {
    authorize(&window, &server)?;
    server.reassign_port()
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
async fn open_releases(window: WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
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
    .use_https_scheme(main_uses_https(app))
    .title("桌面设置 / Desktop settings")
    .inner_size(640.0, 620.0)
    .min_inner_size(560.0, 480.0)
    .build();
    if let Err(error) = result {
        eprintln!("Could not open desktop settings: {error}");
    }
}

fn main_uses_https(app: &tauri::AppHandle) -> bool {
    app.config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .is_some_and(|window| window.use_https_scheme)
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("external-link-guard")
                .on_navigation(|webview, url| {
                    if navigation::opens_externally(url) {
                        let app = webview.app_handle().clone();
                        let url = url.to_string();
                        // Never wait for the OS browser from a WebView2 navigation callback.
                        tauri::async_runtime::spawn_blocking(move || {
                            let _ = app.opener().open_url(url, None::<&str>);
                        });
                        return false;
                    }
                    true
                })
                .build(),
        )
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
        .on_page_load(|webview, payload| {
            if webview.label() == "main"
                && matches!(payload.event(), tauri::webview::PageLoadEvent::Finished)
            {
                if let Some(server) = webview.app_handle().try_state::<server::Server>() {
                    server.record_page_load(payload.url());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            server_status,
            restart_server,
            reassign_port,
            check_update,
            install_update,
            open_releases
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            ctrlc::set_handler(move || handle.exit(0))?;
            let home = navigation::launcher_url(main_uses_https(app.handle()));
            app.manage(server::Server::start(app.handle().clone(), home)?);
            // Preserve the platform's standard editing shortcuts and application menu on macOS.
            #[cfg(target_os = "macos")]
            {
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
            }
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

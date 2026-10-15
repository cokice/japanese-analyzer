fn main() {
    // cargo check and tauri dev do not need the production server payload.
    if std::env::var("PROFILE").as_deref() == Ok("debug") {
        std::fs::create_dir_all("resources/server").expect("development resource directory");
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "server_status",
            "restart_server",
            "reassign_port",
            "check_update",
            "install_update",
            "open_releases",
        ]),
    ))
    .expect("desktop build configuration");
}

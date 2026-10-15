use tauri::Url;

pub fn launcher_url(use_https_scheme: bool) -> Url {
    // The WebView may still report about:blank during setup. Use the configured
    // packaged origin so retry navigation and native-command checks are stable.
    Url::parse(if cfg!(windows) {
        if use_https_scheme {
            "https://tauri.localhost/index.html"
        } else {
            "http://tauri.localhost/index.html"
        }
    } else {
        "tauri://localhost/index.html"
    })
    .expect("packaged launcher URL")
}

pub fn opens_externally(url: &Url) -> bool {
    match url.scheme() {
        "http" | "https" => {
            // Tauri's packaged origin is HTTP(S) on Windows/WebView2 and
            // tauri://localhost on macOS. It must stay inside the application.
            let packaged = url.host_str() == Some("tauri.localhost") && url.port().is_none();
            let loopback = matches!(url.host_str(), Some("127.0.0.1" | "localhost"));
            !packaged && !loopback
        }
        "mailto" | "tel" => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launcher_settings_and_local_server_stay_in_the_webview() {
        assert!(!opens_externally(&launcher_url(false)));
        assert!(!opens_externally(&launcher_url(true)));
        for url in [
            "http://tauri.localhost/",
            "http://tauri.localhost/index.html?settings=1",
            "https://tauri.localhost/",
            "tauri://localhost/index.html",
            "http://127.0.0.1:49152/",
            "http://localhost:3000/",
        ] {
            assert!(!opens_externally(&Url::parse(url).unwrap()), "{url}");
        }
    }

    #[test]
    fn external_links_and_similarly_named_hosts_use_the_os_opener() {
        for url in [
            "https://github.com/cokice/japanese-analyzer",
            "http://tauri.localhost.example.com/",
            "http://localhost.example.com/",
            "http://tauri.localhost:9000/",
            "https://tauri.localhost@evil.example/",
            "mailto:test@example.com",
            "tel:+1234567890",
        ] {
            assert!(opens_externally(&Url::parse(url).unwrap()), "{url}");
        }
    }
}

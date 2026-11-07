//! Kotilo Kit desktop shell. Rust is only the OS bridge: windows, global shortcut, tray,
//! clipboard (plugin), config file I/O and toast timing. All tool logic lives in kit-core (TS).

use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};

use serde::Serialize;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow, WindowEvent, Wry,
};

const THEMES_TOML: &str = include_str!("../../../../docs/05-themes.toml");
const I18N_EN: &str = include_str!("../../../../packages/kit-core/i18n/en.json");
const I18N_TR: &str = include_str!("../../../../packages/kit-core/i18n/tr.json");
const DEFAULT_THEME: &str = "catppuccin-mocha";
const TOAST_MS: u64 = 1500;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FullPayload {
    tool_id: String,
    input: String,
}

#[derive(Default)]
struct AppState {
    /// Last ctrl+Enter hand-off, in case the main window was not listening yet.
    pending_full: Mutex<Option<FullPayload>>,
    /// Bumped on every toast so an older timer does not hide a newer toast.
    toast_gen: AtomicU64,
    theme_items: Mutex<Vec<(String, CheckMenuItem<Wry>)>>,
}

// ---------- config.toml (same location as kit-core `configDir`) ----------

fn config_dir() -> PathBuf {
    if cfg!(windows) {
        let base = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| {
            PathBuf::from(std::env::var_os("USERPROFILE").unwrap_or_default()).join("AppData").join("Roaming")
        });
        return base.join("kotilo").join("kit");
    }
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".config"));
    base.join("kotilo").join("kit")
}

fn config_path() -> PathBuf {
    config_dir().join("config.toml")
}

fn read_config_text() -> String {
    fs::read_to_string(config_path()).unwrap_or_default()
}

/// The few values Rust itself needs: hotkey, UI locale (tray labels), theme (tray check mark).
struct ShellSettings {
    hotkey: String,
    locale: String,
    theme: String,
}

fn shell_settings() -> ShellSettings {
    let value: toml::Value = read_config_text().parse().unwrap_or(toml::Value::Table(Default::default()));
    let get = |section: &str, key: &str| value.get(section).and_then(|s| s.get(key)).and_then(|v| v.as_str()).map(str::to_owned);
    let system = sys_locale::get_locale().unwrap_or_default();
    let locale = get("general", "locale").unwrap_or(system);
    ShellSettings {
        hotkey: get("general", "hotkey").unwrap_or_else(|| "CommandOrControl+Shift+K".into()),
        locale: if locale.to_lowercase().starts_with("tr") { "tr".into() } else { "en".into() },
        theme: get("theme", "id").unwrap_or_else(|| DEFAULT_THEME.into()),
    }
}

fn tr(locale: &str, key: &str) -> String {
    let source = if locale == "tr" { I18N_TR } else { I18N_EN };
    serde_json::from_str::<serde_json::Value>(source)
        .ok()
        .and_then(|v| v.get(key).and_then(|s| s.as_str()).map(str::to_owned))
        .unwrap_or_else(|| key.to_owned())
}

/// (id, name) of the dark themes in docs/05-themes.toml order (light ones are their pairs).
fn primary_themes() -> Vec<(String, String)> {
    // toml::Table preserves file order only with the `preserve_order` feature; keep order by scanning headers.
    let parsed: toml::Value = THEMES_TOML.parse().expect("docs/05-themes.toml is valid TOML");
    THEMES_TOML
        .lines()
        .filter_map(|l| l.trim().strip_prefix("[themes.").and_then(|r| r.strip_suffix(']')))
        .filter_map(|id| {
            let t = parsed.get("themes")?.get(id)?;
            let name = t.get("name")?.as_str()?.to_owned();
            (t.get("variant")?.as_str()? == "dark").then(|| (id.to_owned(), name))
        })
        .collect()
}

// ---------- commands ----------

#[tauri::command]
fn config_read() -> String {
    read_config_text()
}

#[tauri::command]
fn config_write(app: AppHandle, contents: String) -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("config.toml.tmp");
    fs::write(&tmp, contents.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, config_path()).map_err(|e| e.to_string())?;
    sync_theme_checks(&app);
    Ok(())
}

#[tauri::command]
fn hide_window(window: WebviewWindow) {
    let _ = window.hide();
}

#[tauri::command]
fn notify(app: AppHandle, message: String) {
    show_toast(&app, message);
}

#[tauri::command]
fn open_full(app: AppHandle, tool_id: String, input: String) {
    let payload = FullPayload { tool_id, input };
    *app.state::<AppState>().pending_full.lock().unwrap() = Some(payload.clone());
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
    let _ = app.emit_to("main", "open-full", payload);
}

/// Native "Save as…" for the full window's Save button. Bytes arrive as the raw IPC body.
/// Writes only to the path the user just picked in the OS dialog; no general fs access for the webview.
#[tauri::command]
async fn save_file(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_else(|| "output.txt".into());
    let mut dialog = app.dialog().file().set_file_name(&name);
    if let Some(parent) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&parent);
    }
    let Some(path) = dialog.blocking_save_file() else { return Ok(false) };
    let path = path.into_path().map_err(|e| e.to_string())?;
    fs::write(path, bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[tauri::command]
fn pending_full(app: AppHandle) -> Option<FullPayload> {
    app.state::<AppState>().pending_full.lock().unwrap().take()
}

// ---------- windows ----------

/// Top-center of the monitor under the cursor (Spotlight-style), falling back to centering.
fn place_on_cursor_monitor(app: &AppHandle, window: &WebviewWindow, y_ratio: f64) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| window.current_monitor().ok().flatten());
    match (monitor, window.outer_size()) {
        (Some(m), Ok(size)) => {
            let (pos, area) = (m.position(), m.size());
            let x = pos.x + (area.width as i32 - size.width as i32) / 2;
            let y = pos.y + (area.height as f64 * y_ratio) as i32;
            let _ = window.set_position(PhysicalPosition::new(x, y));
        }
        _ => {
            let _ = window.center();
        }
    }
}

fn show_palette(app: &AppHandle) {
    let Some(palette) = app.get_webview_window("palette") else { return };
    place_on_cursor_monitor(app, &palette, 0.2);
    let _ = palette.show();
    let _ = palette.set_focus();
    let _ = app.emit_to("palette", "palette:show", ());
}

fn toggle_palette(app: &AppHandle) {
    let Some(palette) = app.get_webview_window("palette") else { return };
    if palette.is_visible().unwrap_or(false) {
        let _ = palette.hide();
    } else {
        show_palette(app);
    }
}

fn show_toast(app: &AppHandle, message: String) {
    let Some(toast) = app.get_webview_window("toast") else { return };
    let state = app.state::<AppState>();
    let gen = state.toast_gen.fetch_add(1, Ordering::SeqCst) + 1;
    let _ = app.emit_to("toast", "toast:show", message);
    place_on_cursor_monitor(app, &toast, 0.2);
    let app = app.clone();
    std::thread::spawn(move || {
        // let React render the new text before the window appears
        std::thread::sleep(Duration::from_millis(30));
        let _ = toast.show();
        std::thread::sleep(Duration::from_millis(TOAST_MS));
        if app.state::<AppState>().toast_gen.load(Ordering::SeqCst) == gen {
            let _ = toast.hide();
        }
    });
}

fn show_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

// ---------- tray ----------

fn sync_theme_checks(app: &AppHandle) {
    let current = shell_settings().theme;
    for (id, item) in app.state::<AppState>().theme_items.lock().unwrap().iter() {
        let _ = item.set_checked(*id == current);
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let settings = shell_settings();
    let l = settings.locale.as_str();
    let open = MenuItem::with_id(app, "open", tr(l, "tray.open"), true, None::<&str>)?;
    let palette = MenuItem::with_id(app, "palette", tr(l, "tray.palette"), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", tr(l, "tray.quit"), true, None::<&str>)?;

    let mut items = Vec::new();
    for (id, name) in primary_themes() {
        let item = CheckMenuItem::with_id(app, format!("theme:{id}"), name, true, id == settings.theme, None::<&str>)?;
        items.push((id, item));
    }
    let refs: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = items.iter().map(|(_, i)| i as &dyn tauri::menu::IsMenuItem<Wry>).collect();
    let themes = Submenu::with_items(app, tr(l, "tray.theme"), true, &refs)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &palette, &themes, &sep, &quit])?;
    *app.state::<AppState>().theme_items.lock().unwrap() = items;

    TrayIconBuilder::with_id("kit")
        .icon(app.default_window_icon().cloned().expect("bundle icon"))
        .tooltip("Kotilo Kit")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "palette" => show_palette(app),
            "quit" => app.exit(0),
            id => {
                if let Some(theme) = id.strip_prefix("theme:") {
                    // palette window persists it (single writer) and re-checks the menu via config_write
                    let _ = app.emit("theme:set", serde_json::json!({ "id": theme }));
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_palette(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

// ---------- app ----------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // a second launch just opens the palette of the running instance
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_palette(app)));
    }

    builder
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![config_read, config_write, hide_window, notify, open_full, pending_full, save_file])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Full window title bar (docs/02-design.md): macOS keeps native traffic lights over our 44 px bar;
            // Windows/Linux are frameless and kit-ui draws the caption buttons.
            if let Some(main) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    let _ = main.set_title_bar_style(tauri::TitleBarStyle::Overlay);
                    let _ = main.set_title("");
                }
                #[cfg(not(target_os = "macos"))]
                let _ = main.set_decorations(false);
            }

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(|app, _shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                toggle_palette(app);
                            }
                        })
                        .build(),
                )?;
                let hotkey = shell_settings().hotkey;
                let shortcut: Shortcut = hotkey
                    .parse()
                    .or_else(|_| "CommandOrControl+Shift+K".parse())
                    .expect("default shortcut parses");
                if let Err(e) = app.global_shortcut().register(shortcut) {
                    // another app owns the combo — the tray still works
                    eprintln!("[kit] could not register global shortcut {hotkey}: {e}");
                }
            }

            build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| match (window.label(), event) {
            // palette closes when it loses focus
            ("palette", WindowEvent::Focused(false)) => {
                let _ = window.hide();
            }
            // closing the main window only hides it; the app lives in the tray
            ("main", WindowEvent::CloseRequested { api, .. }) => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running Kotilo Kit");
}

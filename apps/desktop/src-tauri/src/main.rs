// The desktop shell (M2-01, ADR-0006): a window with the editor UI, a default menu and Tauri's
// official file system and dialog plugins. The only command of our own replaces a file atomically,
// which no official plugin offers. No product logic lives here.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod atomic_write;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .menu(tauri::menu::Menu::default)
        .invoke_handler(tauri::generate_handler![atomic_write::write_atomic])
        .run(tauri::generate_context!())
        .expect("failed to start the app");
}

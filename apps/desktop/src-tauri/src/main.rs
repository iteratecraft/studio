// The desktop shell (M2-01, ADR-0006): a window with the editor UI, a default menu and Tauri's
// official dialog plugin. Our own file commands (files.rs) put every path the page sends through
// one scope rule; the file system plugin only keeps the files the user picks in a dialog (picks.rs
// remembers them across restarts), and grants the page nothing itself. No product logic lives here.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod files;
mod picks;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .menu(tauri::menu::Menu::default)
        .setup(|app| {
            picks::remember(app.handle())?;
            // The window title follows the page's title, which names the open course and whether
            // it has unsaved changes (M2-08); no page permission is needed for it.
            let config = app
                .config()
                .app
                .windows
                .first()
                .ok_or("tauri.conf.json has no window")?;
            tauri::WebviewWindowBuilder::from_config(app, config)?
                .on_document_title_changed(|window, title| {
                    let _ = window.set_title(&title);
                })
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            files::data_folder,
            files::read_file,
            files::file_modified,
            files::write_atomic,
            files::rename_file,
            files::remove_path,
            files::list_folder,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start the app");
}

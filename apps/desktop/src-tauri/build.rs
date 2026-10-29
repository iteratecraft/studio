fn main() {
    // Listing the app's own commands makes Tauri generate a permission for each, so a capability
    // file must grant them like any plugin command (M2-01).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "data_folder",
            "read_file",
            "file_modified",
            "write_atomic",
            "rename_file",
            "remove_path",
            "list_folder",
            "media_converter",
            "media_install",
            "media_convert",
            "media_cancel",
            "update_ready",
            "update_check",
            "update_download",
            "update_cancel",
            "update_install",
        ]),
    ))
    .expect("failed to run the Tauri build script");
}

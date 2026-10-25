fn main() {
    // Listing the app's own commands makes Tauri generate a permission for each, so a capability
    // file must grant them like any plugin command (M2-01).
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["write_atomic"])),
    )
    .expect("failed to run the Tauri build script");
}

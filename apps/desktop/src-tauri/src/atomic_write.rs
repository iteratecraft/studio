// `write_atomic`: replaces a file's contents so that a reader, or the file after a crash, sees the
// old bytes or the new ones, never a mix (HostFiles.write in packages/host). It writes a temporary
// file next to the target, flushes it to disk and renames it over the target.
//
// It may write only where the file system plugin may read: a file the user picked in a dialog
// (the dialog plugin adds it to the plugin's scope), or a file in the app's local data folder.
// The file bytes are the raw request body and the path is the `path` header, percent-encoded
// (`encodeURIComponent`), so a large file crosses the IPC bridge without being copied into JSON.

use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;

#[tauri::command]
pub fn write_atomic<R: Runtime>(app: AppHandle<R>, request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("write_atomic expects the file bytes as the request body".into());
    };
    let path = request
        .headers()
        .get("path")
        .and_then(|value| value.to_str().ok())
        .and_then(percent_decode)
        .map(PathBuf::from)
        .ok_or("write_atomic expects a percent-encoded path header")?;
    if !is_plain_absolute(&path) {
        return Err(format!("not an absolute path: {}", path.display()));
    }
    let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    if path.starts_with(&data_dir) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    } else if !app.fs_scope().is_allowed(&path) {
        return Err(format!("not allowed to write {}", path.display()));
    }
    replace_atomically(&path, data).map_err(|e| format!("could not write {}: {e}", path.display()))
}

/// An absolute path without `..` parts, so a prefix check cannot be walked out of. (`components`
/// already drops `.` parts, the same way for this path and for the prefix it is checked against.)
fn is_plain_absolute(path: &Path) -> bool {
    path.is_absolute() && !path.components().any(|c| c == Component::ParentDir)
}

/// Decodes `encodeURIComponent` output; `None` for malformed escapes or bytes that are not UTF-8.
fn percent_decode(text: &str) -> Option<String> {
    let mut bytes = Vec::with_capacity(text.len());
    let mut rest = text.as_bytes();
    while let Some((&byte, tail)) = rest.split_first() {
        if byte == b'%' {
            let hex = std::str::from_utf8(tail.get(..2)?).ok()?;
            bytes.push(u8::from_str_radix(hex, 16).ok()?);
            rest = &tail[2..];
        } else {
            bytes.push(byte);
            rest = tail;
        }
    }
    String::from_utf8(bytes).ok()
}

/// Gives each temporary file of this process its own name, so two writes never share one.
static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

fn replace_atomically(path: &Path, data: &[u8]) -> io::Result<()> {
    let (Some(dir), Some(name)) = (path.parent(), path.file_name()) else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "not a file path",
        ));
    };
    let mut temp_name = OsString::from(".");
    temp_name.push(name);
    temp_name.push(format!(
        ".{}-{}.tmp",
        std::process::id(),
        NEXT_TEMP.fetch_add(1, Ordering::Relaxed)
    ));
    let temp = dir.join(temp_name);
    let result = (|| {
        let mut file = File::create_new(&temp)?;
        file.write_all(data)?;
        file.sync_all()?;
        drop(file);
        // On Windows this is MoveFileExW with MOVEFILE_REPLACE_EXISTING: one step on one volume.
        fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_encode_uri_component_output() {
        assert_eq!(
            percent_decode("C%3A%5CUsers%5CJ%C3%B6rg%5Ca%20b.zip").as_deref(),
            Some(r"C:\Users\Jörg\a b.zip")
        );
        assert_eq!(percent_decode("plain").as_deref(), Some("plain"));
    }

    #[test]
    fn rejects_malformed_escapes() {
        for text in ["%", "%4", "%zz", "%C3", "a%2"] {
            assert_eq!(percent_decode(text), None, "{text}");
        }
    }

    #[test]
    fn accepts_only_plain_absolute_paths() {
        let base = std::env::temp_dir();
        assert!(is_plain_absolute(&base.join("a.zip")));
        assert!(!is_plain_absolute(&base.join("..").join("a.zip")));
        assert!(!is_plain_absolute(Path::new("a.zip")));
    }

    #[test]
    fn replaces_the_whole_file_and_leaves_no_temporary_file() {
        let dir = std::env::temp_dir().join(format!("write-atomic-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("course.zip");
        fs::write(&target, b"old contents that are longer").unwrap();
        replace_atomically(&target, b"new").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new");
        let names: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(names, vec![OsString::from("course.zip")]);
        fs::remove_dir_all(&dir).unwrap();
    }
}

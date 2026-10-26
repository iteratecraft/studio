// The shell's file commands (HostFiles in packages/host). Every path the page sends goes through
// one rule, `place`, and each command allows some places:
//
// - The data folder, `<app local data folder>\data`: everything. The app local data folder itself
//   also holds WebView2's own profile (`EBWebView`), so the page never reaches the folder above
//   `data`.
// - A file the user picked in a dialog, which the dialog plugin adds to the file system plugin's
//   scope (and `picks.rs` again on later starts): read it and replace it.
// - The autosave folder of a picked file, `.<file name>.autosave` next to it (D-4): everything
//   inside, and renaming a file from there over the picked file. Nothing else in that folder.
//
// `write_atomic` replaces a file so that a reader, or the file after a crash, sees the old bytes or
// the new ones, never a mix: it writes a temporary file next to the target, flushes it and renames
// it over the target. Its bytes are the raw request body and the path is the `path` header,
// percent-encoded (`encodeURIComponent`), so a large file crosses the IPC bridge without being
// copied into JSON. A refusal is an error string starting with its HostError code and a colon.

use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, ErrorKind, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::UNIX_EPOCH;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;

/// Where a path is, as far as the page's access goes.
#[derive(Debug, PartialEq)]
enum Place {
    /// Anything in the data folder.
    Data,
    /// A file the user picked.
    Picked,
    /// The autosave folder of the picked file it holds, or anything in that folder.
    Autosave(PathBuf),
}

/// The one scope rule. `picked` says whether the user picked a path in a dialog.
fn place(path: &Path, data: &Path, picked: &dyn Fn(&Path) -> bool) -> Option<Place> {
    if !is_plain_absolute(path) {
        return None;
    }
    if path.starts_with(data) {
        // The data folder itself is not the page's to replace, rename or remove.
        return (path != data).then_some(Place::Data);
    }
    for folder in path.ancestors() {
        let (Some(parent), Some(name)) = (folder.parent(), folder.file_name()) else {
            continue;
        };
        let file = name
            .to_str()
            .and_then(|name| name.strip_prefix('.')?.strip_suffix(".autosave"))
            .filter(|file| is_plain_name(file));
        if let Some(file) = file {
            let project = parent.join(file);
            if picked(&project) {
                return Some(Place::Autosave(project));
            }
        }
    }
    picked(path).then_some(Place::Picked)
}

/// Renames stay in one place, so they are one step on one volume, and a picked file can only be
/// replaced by a file from its own autosave folder, never moved away.
fn may_rename(from: &Place, to: &Place, to_path: &Path) -> bool {
    match (from, to) {
        (Place::Data, Place::Data) => true,
        (Place::Autosave(a), Place::Autosave(b)) => a == b,
        (Place::Autosave(project), Place::Picked) => project == to_path,
        _ => false,
    }
}

/// An absolute path without `..` parts, and without parts Windows would change (see
/// `is_plain_name`), so a prefix check cannot be walked out of. (`components` already drops `.`
/// parts, the same way for this path and for the prefix it is checked against.)
fn is_plain_absolute(path: &Path) -> bool {
    path.is_absolute()
        && path.components().all(|c| match c {
            Component::Normal(name) => name.to_str().is_some_and(is_plain_name),
            Component::ParentDir => false,
            _ => true,
        })
}

/// A file or folder name Windows keeps as written: it drops a trailing dot or space, so `data.`
/// would name `data`, and `...` the folder it is in.
fn is_plain_name(name: &str) -> bool {
    !name.is_empty() && !name.ends_with(['.', ' '])
}

/// The data folder: `data` in the app local data folder, which also holds WebView2's profile.
fn data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("data"))
}

/// The place of `path`, or a "not-allowed" refusal.
fn checked<R: Runtime>(app: &AppHandle<R>, path: &Path) -> Result<Place, String> {
    let scope = app.fs_scope();
    place(path, &data_dir(app)?, &|p| scope.is_allowed(p)).ok_or_else(|| not_allowed(path))
}

fn not_allowed(path: &Path) -> String {
    format!("not-allowed: {}", path.display())
}

fn io_error(path: &Path, error: io::Error) -> String {
    let code = if error.kind() == ErrorKind::NotFound {
        "not-found: "
    } else {
        ""
    };
    format!("{code}{}: {error}", path.display())
}

/// The data folder's path, for `HostFiles.dataFile`.
#[tauri::command]
pub fn data_folder<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    data_dir(&app).map(|dir| dir.display().to_string())
}

#[tauri::command]
pub async fn read_file<R: Runtime>(app: AppHandle<R>, path: PathBuf) -> Result<Response, String> {
    checked(&app, &path)?;
    fs::read(&path)
        .map(Response::new)
        .map_err(|e| io_error(&path, e))
}

/// When a file last changed, in milliseconds since 1970, for `HostFiles.modified`; `None` when
/// it does not exist. Allowed wherever reading is; the file is not opened.
#[tauri::command]
pub async fn file_modified<R: Runtime>(
    app: AppHandle<R>,
    path: PathBuf,
) -> Result<Option<u64>, String> {
    checked(&app, &path)?;
    match fs::metadata(&path).and_then(|meta| meta.modified()) {
        Ok(time) => Ok(Some(
            time.duration_since(UNIX_EPOCH)
                .map_or(0, |since| since.as_millis() as u64),
        )),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(io_error(&path, e)),
    }
}

#[tauri::command]
pub async fn write_atomic<R: Runtime>(
    app: AppHandle<R>,
    request: Request<'_>,
) -> Result<(), String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("invalid: write_atomic expects the file bytes as the request body".into());
    };
    let path = request
        .headers()
        .get("path")
        .and_then(|value| value.to_str().ok())
        .and_then(percent_decode)
        .map(PathBuf::from)
        .ok_or("invalid: write_atomic expects a percent-encoded path header")?;
    if checked(&app, &path)? != Place::Picked
        && let Some(parent) = path.parent()
    {
        fs::create_dir_all(parent).map_err(|e| io_error(parent, e))?;
    }
    replace_atomically(&path, data).map_err(|e| io_error(&path, e))
}

/// Moves a file in one step, replacing `to` (see `may_rename`).
#[tauri::command]
pub async fn rename_file<R: Runtime>(
    app: AppHandle<R>,
    from: PathBuf,
    to: PathBuf,
) -> Result<(), String> {
    if !may_rename(&checked(&app, &from)?, &checked(&app, &to)?, &to) {
        return Err(format!(
            "not-allowed: {} to {}",
            from.display(),
            to.display()
        ));
    }
    fs::rename(&from, &to).map_err(|e| io_error(&from, e))
}

/// Deletes a file, or a folder and everything in it, in the data folder or an autosave folder.
/// Nothing happens when it does not exist.
#[tauri::command]
pub async fn remove_path<R: Runtime>(app: AppHandle<R>, path: PathBuf) -> Result<(), String> {
    if checked(&app, &path)? == Place::Picked {
        return Err(not_allowed(&path));
    }
    let result = match fs::symlink_metadata(&path) {
        Ok(meta) if meta.is_dir() => fs::remove_dir_all(&path),
        Ok(_) => fs::remove_file(&path),
        Err(e) => Err(e),
    };
    match result {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(io_error(&path, e)),
        _ => Ok(()),
    }
}

/// Names of the files directly in a folder in the data folder or an autosave folder; empty when
/// the folder does not exist. Names that are not valid Unicode are left out.
#[tauri::command]
pub async fn list_folder<R: Runtime>(
    app: AppHandle<R>,
    path: PathBuf,
) -> Result<Vec<String>, String> {
    if checked(&app, &path)? == Place::Picked {
        return Err(not_allowed(&path));
    }
    let entries = match fs::read_dir(&path) {
        Ok(entries) => entries,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(io_error(&path, e)),
    };
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| io_error(&path, e))?;
        if entry.file_type().map_err(|e| io_error(&path, e))?.is_file()
            && let Ok(name) = entry.file_name().into_string()
        {
            names.push(name);
        }
    }
    Ok(names)
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

pub fn replace_atomically(path: &Path, data: &[u8]) -> io::Result<()> {
    let (Some(dir), Some(name)) = (path.parent(), path.file_name()) else {
        return Err(io::Error::new(ErrorKind::InvalidInput, "not a file path"));
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
        for part in ["..", "...", "data.", "data "] {
            assert!(!is_plain_absolute(&base.join(part).join("a.zip")), "{part}");
        }
        assert!(!is_plain_absolute(Path::new("a.zip")));
    }

    /// The app local data folder, its data folder and a picked project, as on Windows.
    struct Fixture {
        local: PathBuf,
        data: PathBuf,
        project: PathBuf,
    }

    fn fixture() -> Fixture {
        let local = std::env::temp_dir().join("org.iteratecraft.coursesuite");
        let project = std::env::temp_dir().join("Courses").join("Safety.crs");
        Fixture {
            data: local.join("data"),
            local,
            project,
        }
    }

    impl Fixture {
        fn place(&self, path: &Path) -> Option<Place> {
            place(path, &self.data, &|p| p == self.project)
        }
    }

    #[test]
    fn webview2_profile_next_to_the_data_folder_is_out_of_scope() {
        let f = fixture();
        let profile = f.local.join("EBWebView");
        for path in [
            profile.clone(),
            profile.join("Local State"),
            profile.join("Default").join("Preferences"),
            f.local.join("settings.json"),
            // The remembered picks (picks.rs): page script must not add to them.
            f.local.join("picked.txt"),
            f.data.clone(),
            f.data.join("..").join("EBWebView").join("Local State"),
            f.local.join("data.").join("x"),
        ] {
            assert_eq!(f.place(&path), None, "{}", path.display());
        }
        let file = f.data.join("autosave").join("a.zip");
        assert_eq!(f.place(&file), Some(Place::Data));
    }

    #[test]
    fn a_picked_file_brings_its_autosave_folder_and_nothing_else_in_its_folder() {
        let f = fixture();
        let folder = f.project.parent().unwrap();
        let autosave = folder.join(".Safety.crs.autosave");
        assert_eq!(f.place(&f.project), Some(Place::Picked));
        for path in [autosave.clone(), autosave.join("3.crs")] {
            assert_eq!(f.place(&path), Some(Place::Autosave(f.project.clone())));
        }
        for path in [
            folder.join("Other.crs"),
            folder.join(".Other.crs.autosave").join("3.crs"),
            folder.join("..autosave").join("x"),
            folder.join("....autosave").join("x"),
            folder.to_path_buf(),
        ] {
            assert_eq!(f.place(&path), None, "{}", path.display());
        }
    }

    #[test]
    fn renames_stay_in_one_place_and_never_move_a_picked_file_away() {
        let f = fixture();
        let autosave = Place::Autosave(f.project.clone());
        let other = f.project.with_file_name("Other.crs");
        let elsewhere = Place::Autosave(other.clone());
        assert!(may_rename(&Place::Data, &Place::Data, &f.data));
        assert!(may_rename(&autosave, &autosave, &f.project));
        assert!(may_rename(&autosave, &Place::Picked, &f.project));
        assert!(!may_rename(&autosave, &Place::Picked, &other));
        assert!(!may_rename(&autosave, &elsewhere, &other));
        assert!(!may_rename(&Place::Picked, &autosave, &f.project));
        assert!(!may_rename(&Place::Picked, &Place::Picked, &f.project));
        assert!(!may_rename(&Place::Data, &autosave, &f.project));
        assert!(!may_rename(&autosave, &Place::Data, &f.data));
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

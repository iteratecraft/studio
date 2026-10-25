// Files the user picked, remembered across restarts (M2-08), so the editor's recent courses open
// again without a dialog. The dialog plugin adds each pick to the file system plugin's scope for
// this run only; this keeps the newest picks in `picked.txt` in the app local data folder, beside
// the data folder and so out of the page's reach (files.rs), and allows them again at start. Only
// a dialog adds to the list: page script cannot.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;

use crate::files::replace_atomically;

/// How many picked files are remembered, newest first; older ones need the open dialog again.
const REMEMBERED: usize = 100;

/// Allows the remembered picks again, then remembers each new one.
pub fn remember<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let list = dir.join("picked.txt");
    let scope = app.fs_scope();
    let picks = parse(&fs::read_to_string(&list).unwrap_or_default());
    for path in &picks {
        // A remembered path that no longer parses as a pattern is simply not allowed again.
        let _ = scope.allow_file(path);
    }
    let picks = Mutex::new(picks);
    scope.listen(move |event| {
        let tauri::fs::Event::PathAllowed(path) = event else {
            return;
        };
        let Ok(mut picks) = picks.lock() else {
            return;
        };
        if add(&mut picks, path) {
            // Losing the list only means the next start asks for those files again.
            let _ = fs::create_dir_all(&dir)
                .and_then(|()| replace_atomically(&list, text(&picks).as_bytes()));
        }
    });
    Ok(())
}

/// Puts `path` first; says whether the list changed.
fn add(picks: &mut Vec<PathBuf>, path: &Path) -> bool {
    if picks.first().is_some_and(|first| first == path) {
        return false;
    }
    picks.retain(|pick| pick != path);
    picks.insert(0, path.to_path_buf());
    picks.truncate(REMEMBERED);
    true
}

/// One absolute path per line (a path cannot hold a line break on Windows).
fn parse(text: &str) -> Vec<PathBuf> {
    text.lines()
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .take(REMEMBERED)
        .collect()
}

fn text(picks: &[PathBuf]) -> String {
    picks
        .iter()
        .filter_map(|path| path.to_str())
        .map(|path| format!("{path}\n"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(name: &str) -> PathBuf {
        std::env::temp_dir().join(name)
    }

    #[test]
    fn newest_pick_comes_first_once_and_the_list_is_capped() {
        let mut picks = Vec::new();
        assert!(add(&mut picks, &path("a.crs")));
        assert!(add(&mut picks, &path("b.crs")));
        assert!(!add(&mut picks, &path("b.crs")));
        assert!(add(&mut picks, &path("a.crs")));
        assert_eq!(picks, vec![path("a.crs"), path("b.crs")]);
        for i in 0..REMEMBERED + 5 {
            add(&mut picks, &path(&format!("{i}.crs")));
        }
        assert_eq!(picks.len(), REMEMBERED);
        assert_eq!(picks[0], path(&format!("{}.crs", REMEMBERED + 4)));
    }

    #[test]
    fn the_list_reads_back_as_written_and_skips_relative_lines() {
        let picks = vec![path("Jörg's course.crs"), path("b.crs")];
        assert_eq!(parse(&text(&picks)), picks);
        assert_eq!(parse("relative.crs\n\n"), Vec::<PathBuf>::new());
    }
}

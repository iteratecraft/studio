// Updates from GitHub Releases (M2-20; M0-09, D-29, D-62, ADR-0004, ADR-0006): Tauri's official
// updater reads `latest.json` of this repository's latest *published* release (GitHub never
// serves a draft or a pre-release as latest), downloads the installer it names and checks its
// signature against the public key built into the app (`plugins.updater.pubkey` in
// tauri.conf.json, which also binds the signed version: `requireSignedVersion`). Only then, and
// only after the editor asked the author and saved or asked about their work, it runs the NSIS
// installer, which replaces this per-user install in place and starts the new version. Until the
// lead sets the public key (docs/release.md), every command says the build cannot update.
//
// The page decides when to check (at start at most once a day, never offline or when turned off,
// and from Help > Check for updates, which this file adds to the window's menu). Errors come back
// as `<reason>: <details>` for the page to put in plain words: `unavailable`, `network`,
// `invalid` (the update information), `signature` and `failed`.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::menu::{HELP_SUBMENU_ID, Menu, MenuEvent, MenuItem, MenuItemKind};
use tauri::{AppHandle, Emitter, Runtime, State, ipc::Channel};
use tauri_plugin_updater::{Error, Update, UpdaterExt};

/// The menu item's id, and the event the page hears when the author picks it.
pub const CHECK: &str = "check-for-updates";

/// How long a check may take, and a download: a stalled connection ends in a plain error.
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(15 * 60);

/// The update the last check found, its verified installer once downloaded, and the way to stop
/// a download that is running.
#[derive(Default)]
pub struct Updates {
    found: Mutex<Option<Update>>,
    installer: Mutex<Option<Vec<u8>>>,
    stop: Mutex<Option<Box<dyn Fn() + Send>>>,
}

/// What the page shows about a newer version.
#[derive(Serialize)]
pub struct Found {
    version: String,
    notes: String,
}

/// The window's default menu, with Help > Check for updates first in its Help menu.
pub fn menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    if let Some(MenuItemKind::Submenu(help)) = menu.get(HELP_SUBMENU_ID) {
        help.prepend(&MenuItem::with_id(
            app,
            CHECK,
            "Check for updates…",
            true,
            None::<&str>,
        )?)?;
    }
    Ok(menu)
}

/// Passes Help > Check for updates to the page, which checks and shows the answer.
pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if event.id() == CHECK {
        let _ = app.emit_to("main", CHECK, ());
    }
}

/// The public key the build carries; empty until the lead sets it (docs/release.md).
fn pubkey<R: Runtime>(app: &AppHandle<R>) -> String {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(|key| key.as_str())
        .unwrap_or_default()
        .trim()
        .to_owned()
}

/// Whether this build can update itself: it carries the public key its updates are signed with.
#[tauri::command]
pub fn update_ready<R: Runtime>(app: AppHandle<R>) -> bool {
    !pubkey(&app).is_empty()
}

/// Asks the latest published release whether there is a newer version; `None` when there is not.
#[tauri::command]
pub async fn update_check<R: Runtime>(
    app: AppHandle<R>,
    updates: State<'_, Updates>,
) -> Result<Option<Found>, String> {
    if pubkey(&app).is_empty() {
        return Err("unavailable: this build carries no update signing key".into());
    }
    let updater = app
        .updater_builder()
        .timeout(CHECK_TIMEOUT)
        .build()
        .map_err(reason)?;
    let update = updater.check().await.map_err(reason)?;
    let found = update.as_ref().map(|update| Found {
        version: update.version.clone(),
        notes: update.body.clone().unwrap_or_default(),
    });
    *lock(&updates.installer) = None;
    *lock(&updates.found) = update;
    Ok(found)
}

/// Downloads the update the last check found and checks its signature; the installer is kept
/// for `update_install`. Progress comes back as `[bytes done, total bytes or 0]`.
#[tauri::command]
pub async fn update_download(
    updates: State<'_, Updates>,
    on_progress: Channel<[u64; 2]>,
) -> Result<(), String> {
    let Some(mut update) = lock(&updates.found).clone() else {
        return Err("failed: there is no update to download; check again".into());
    };
    update.timeout = Some(DOWNLOAD_TIMEOUT);
    let task = tauri::async_runtime::spawn(async move {
        let mut done = 0u64;
        update
            .download(
                |chunk, total| {
                    done += chunk as u64;
                    let _ = on_progress.send([done, total.unwrap_or(0)]);
                },
                || {},
            )
            .await
    });
    let abort = task.inner().abort_handle();
    *lock(&updates.stop) = Some(Box::new(move || abort.abort()));
    let result = task.await;
    *lock(&updates.stop) = None;
    // A cancelled task never finishes: the page gets "cancelled", and nothing was kept.
    let installer = result
        .map_err(|_| "cancelled: the download was stopped".to_owned())?
        .map_err(reason)?;
    *lock(&updates.installer) = Some(installer);
    Ok(())
}

/// Stops a download that is running; nothing happens when none is.
#[tauri::command]
pub fn update_cancel(updates: State<'_, Updates>) {
    if let Some(stop) = lock(&updates.stop).take() {
        stop();
    }
}

/// Runs the downloaded installer, which replaces this install and starts the new version. On
/// Windows the app exits as the installer starts, so this returns only when that failed.
#[tauri::command]
pub fn update_install(updates: State<'_, Updates>) -> Result<(), String> {
    let update = lock(&updates.found).clone();
    let installer = lock(&updates.installer).take();
    let (Some(update), Some(installer)) = (update, installer) else {
        return Err("failed: the update is not downloaded; check again".into());
    };
    // Checked again before it runs: these bytes are what the signature covers.
    update.install(installer).map_err(reason)
}

/// A poisoned lock only means an earlier command panicked; its value is still the latest.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// The page's reason for an updater error, then its own words for the details.
fn reason(error: Error) -> String {
    format!("{}: {error}", kind(&error))
}

fn kind(error: &Error) -> &'static str {
    match error {
        Error::Reqwest(_) | Error::Network(_) => "network",
        Error::ReleaseNotFound
        | Error::Serialization(_)
        | Error::Semver(_)
        | Error::UrlParse(_)
        | Error::TargetNotFound(_)
        | Error::TargetsNotFound(_) => "invalid",
        Error::Minisign(_)
        | Error::Base64(_)
        | Error::SignatureUtf8(_)
        | Error::SignedVersionMismatch { .. }
        | Error::MissingSignedVersion
        | Error::InvalidUpdaterFormat => "signature",
        _ => "failed",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tampered_or_unsigned_download_is_a_signature_failure() {
        for error in [
            Error::MissingSignedVersion,
            Error::SignedVersionMismatch {
                signed: "0.1.0".into(),
                announced: "0.2.0".into(),
            },
            Error::SignatureUtf8("x".into()),
            Error::InvalidUpdaterFormat,
        ] {
            assert_eq!(kind(&error), "signature", "{error}");
        }
    }

    #[test]
    fn unreachable_or_unreadable_update_information_has_its_own_reasons() {
        assert_eq!(kind(&Error::Network("503".into())), "network");
        assert_eq!(kind(&Error::ReleaseNotFound), "invalid");
        assert_eq!(kind(&Error::TargetsNotFound(vec![])), "invalid");
        assert_eq!(kind(&Error::Io(std::io::Error::other("x"))), "failed");
        assert!(reason(Error::ReleaseNotFound).starts_with("invalid: "));
    }
}

// Help > User guide (M2-22, ENG-40): opens the user guide on GitHub in the author's default
// browser, through Windows' own handler for web addresses. Opening a page is navigation, like a
// link a learner clicks, not a connection of the app (ADR-0004): the app fetches nothing, and the
// page gets no command or permission for it. The address is fixed here.

use std::process::{Command, Stdio};

use tauri::menu::{HELP_SUBMENU_ID, Menu, MenuEvent, MenuItem, MenuItemKind};
use tauri::{AppHandle, Runtime};

/// The menu item's id.
pub const GUIDE: &str = "user-guide";

/// The guide's first page in this repository (docs/guide/README.md).
const GUIDE_URL: &str = "https://github.com/iteratecraft/studio/blob/main/docs/guide/README.md";

/// Puts Help > User guide first in the window's Help menu.
pub fn add_guide<R: Runtime>(app: &AppHandle<R>, menu: &Menu<R>) -> tauri::Result<()> {
    if let Some(MenuItemKind::Submenu(help)) = menu.get(HELP_SUBMENU_ID) {
        help.prepend(&MenuItem::with_id(
            app,
            GUIDE,
            "User guide",
            true,
            None::<&str>,
        )?)?;
    }
    Ok(())
}

/// Opens the guide when the author picks Help > User guide.
pub fn on_menu_event(event: &MenuEvent) {
    if event.id() == GUIDE {
        // A menu item has no page to tell of a failure; the browser simply does not open.
        let _ = browser(GUIDE_URL).spawn();
    }
}

/// The system's handler for web addresses, which opens the default browser. No shell is
/// involved, and on Windows the program is named by its full path.
fn browser(url: &str) -> Command {
    #[cfg(windows)]
    let mut command = {
        let mut command = Command::new(crate::media::system_tool("rundll32"));
        command.arg("url.dll,FileProtocolHandler");
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");
    command.arg(url).stdin(Stdio::null());
    command
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_guide_opens_from_this_repository_over_https() {
        assert!(
            GUIDE_URL.starts_with("https://github.com/iteratecraft/studio/blob/main/docs/guide/")
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_opens_the_guide_with_its_own_url_handler_by_full_path() {
        let command = browser(GUIDE_URL);
        let program = std::path::Path::new(command.get_program());
        assert!(program.is_absolute(), "{program:?}");
        assert!(program.ends_with("System32\\rundll32.exe"), "{program:?}");
        let args: Vec<_> = command.get_args().collect();
        assert_eq!(args, ["url.dll,FileProtocolHandler", GUIDE_URL]);
    }
}

// The media converter (M2-13; D-12, D-43, ADR-0006): a pinned LGPL FFmpeg build, downloaded from
// its public GitHub release only after the editor asked the author, checked by SHA-256 and kept in
// `tools` in the app local data folder, beside the data folder and so out of the page's reach
// (files.rs). It runs as a separate program with arguments this file builds, never through a
// shell, and only on files the page may read. The download and the archive use Windows' own
// `curl.exe` and `tar.exe`, so the app carries no HTTP or ZIP code of its own.
//
// Progress goes back through a channel as `[done, total]`: bytes while downloading, milliseconds of
// media while converting. `media_cancel` stops a task by the job id the page gave it; the task
// then removes what it wrote and fails with "cancelled".

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, Manager, Runtime, State};

use crate::files::{Place, checked};

/// The pinned build (media-tool.json, which the licence gate reads too).
#[derive(Deserialize)]
struct Pin {
    name: String,
    licence: String,
    url: String,
    sha256: String,
    size: u64,
    folder: String,
}

static PIN: LazyLock<Pin> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../media-tool.json")).expect("media-tool.json is invalid")
});

/// Cancel flags of the running tasks, by the page's job id.
#[derive(Default)]
pub struct Tasks(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl Tasks {
    fn start(&self, job: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Ok(mut tasks) = self.0.lock() {
            tasks.insert(job.to_owned(), flag.clone());
        }
        flag
    }

    fn end(&self, job: &str) {
        if let Ok(mut tasks) = self.0.lock() {
            tasks.remove(job);
        }
    }
}

#[derive(Serialize)]
pub struct ConverterInfo {
    installed: bool,
    name: String,
    licence: String,
    size: u64,
}

const CANCELLED: &str = "cancelled";

/// `tools/<build folder>` and the Rust-only work folder, in the app local data folder.
fn folders<R: Runtime>(app: &AppHandle<R>) -> Result<(PathBuf, PathBuf), String> {
    let local = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok((
        local.join("tools").join(&PIN.folder),
        local.join("media-work"),
    ))
}

fn converter_exe(install: &Path) -> PathBuf {
    install.join("bin").join("ffmpeg.exe")
}

/// Installed once the archive checked out and was unpacked: the marker holds the pinned hash.
fn is_installed(install: &Path) -> bool {
    converter_exe(install).is_file()
        && fs::read_to_string(install.join(".verified")).is_ok_and(|hash| hash == PIN.sha256)
}

/// A program that ships with Windows, by its full path, so no search path is involved.
fn system_tool(name: &str) -> PathBuf {
    let root = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
    PathBuf::from(root)
        .join("System32")
        .join(format!("{name}.exe"))
}

/// A child process without a console window and without a shell.
fn command(program: &Path) -> Command {
    let mut command = Command::new(program);
    command.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// Waits for `child`, calling `tick` about every 200 ms; kills it when the task is cancelled.
fn wait(child: &mut Child, cancel: &AtomicBool, mut tick: impl FnMut()) -> Result<bool, String> {
    loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(CANCELLED.into());
        }
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Ok(status.success());
        }
        tick();
        std::thread::sleep(Duration::from_millis(200));
    }
}

fn sha256_of(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0; 1 << 20];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

/// Whether the converter is installed, and what downloading it takes.
#[tauri::command]
pub async fn media_converter<R: Runtime>(app: AppHandle<R>) -> Result<ConverterInfo, String> {
    let (install, _) = folders(&app)?;
    Ok(ConverterInfo {
        installed: is_installed(&install),
        name: PIN.name.clone(),
        licence: PIN.licence.clone(),
        size: PIN.size,
    })
}

/// Downloads the pinned build, checks its size and SHA-256, and unpacks its programs.
#[tauri::command]
pub async fn media_install<R: Runtime>(
    app: AppHandle<R>,
    tasks: State<'_, Tasks>,
    job: String,
    on_progress: Channel<[u64; 2]>,
) -> Result<(), String> {
    let (install, work) = folders(&app)?;
    if is_installed(&install) {
        return Ok(());
    }
    let cancel = tasks.start(&job);
    let archive = work.join(format!("{job}.zip"));
    let unpacked = work.join(format!("{job}.unpacked"));
    let result = tauri::async_runtime::spawn_blocking(move || {
        let result = install_from(&archive, &unpacked, &install, &cancel, &on_progress);
        let _ = fs::remove_file(&archive);
        let _ = fs::remove_dir_all(&unpacked);
        result
    })
    .await
    .map_err(|e| e.to_string());
    tasks.end(&job);
    result?
}

fn install_from(
    archive: &Path,
    unpacked: &Path,
    install: &Path,
    cancel: &AtomicBool,
    progress: &Channel<[u64; 2]>,
) -> Result<(), String> {
    let parent = archive.parent().ok_or("no work folder")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut curl = command(&system_tool("curl"))
        .args(["--fail", "--location", "--silent", "--show-error"])
        .args([
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--max-redirs",
            "5",
        ])
        .arg("--output")
        .arg(archive)
        .arg(&PIN.url)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("cannot start the download: {e}"))?;
    let ok = wait(&mut curl, cancel, || {
        let done = fs::metadata(archive).map_or(0, |meta| meta.len());
        let _ = progress.send([done.min(PIN.size), PIN.size]);
    })?;
    if !ok {
        let mut message = String::new();
        if let Some(mut stderr) = curl.stderr.take() {
            let _ = stderr.read_to_string(&mut message);
        }
        return Err(format!("the download failed: {}", message.trim()));
    }
    let size = fs::metadata(archive).map_err(|e| e.to_string())?.len();
    let hash = sha256_of(archive).map_err(|e| e.to_string())?;
    if size != PIN.size || hash != PIN.sha256 {
        return Err(format!(
            "the download is not the pinned build (SHA-256 {hash}, {size} bytes)"
        ));
    }
    let _ = progress.send([PIN.size, PIN.size]);
    fs::create_dir_all(unpacked).map_err(|e| e.to_string())?;
    let mut tar = command(&system_tool("tar"))
        .arg("-x")
        .arg("-f")
        .arg(archive)
        .arg("-C")
        .arg(unpacked)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("cannot unpack the download: {e}"))?;
    if !wait(&mut tar, cancel, || {})? {
        return Err("the download could not be unpacked".into());
    }
    let folder = unpacked.join(&PIN.folder);
    if !converter_exe(&folder).is_file() {
        return Err("the download holds no converter".into());
    }
    let _ = fs::remove_dir_all(install);
    fs::create_dir_all(install.parent().ok_or("no tools folder")?).map_err(|e| e.to_string())?;
    fs::rename(&folder, install).map_err(|e| e.to_string())?;
    fs::write(install.join(".verified"), &PIN.sha256).map_err(|e| e.to_string())
}

/// The converter's arguments: fixed settings around the input and output paths (D-12: royalty-free
/// codecs). Video: WebM with VP9 at most 1920 x 1080 and 10 Mbit/s, and Opus; audio: MP3.
fn convert_args(input: &Path, output: &Path, video: bool) -> Vec<std::ffi::OsString> {
    let mut args: Vec<std::ffi::OsString> = ["-hide_banner", "-nostdin", "-y", "-i"]
        .map(Into::into)
        .to_vec();
    args.push(input.into());
    let settings: &[&str] = if video {
        &[
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
            "-c:v",
            "libvpx-vp9",
            "-crf",
            "32",
            "-b:v",
            "10M",
            "-deadline",
            "good",
            "-cpu-used",
            "4",
            "-row-mt",
            "1",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "libopus",
            "-b:a",
            "128k",
            "-f",
            "webm",
        ]
    } else {
        &[
            "-map",
            "0:a:0",
            "-vn",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            "-f",
            "mp3",
        ]
    };
    args.extend(settings.iter().map(Into::into));
    args.extend(["-progress", "pipe:1", "-nostats"].map(Into::into));
    args.push(output.into());
    args
}

/// Milliseconds in an FFmpeg `Duration: 00:01:02.50,` line.
fn duration_ms(line: &str) -> Option<u64> {
    let time = line.trim().strip_prefix("Duration: ")?.split(',').next()?;
    let mut parts = time.split(':');
    let hours: f64 = parts.next()?.parse().ok()?;
    let minutes: f64 = parts.next()?.parse().ok()?;
    let seconds: f64 = parts.next()?.parse().ok()?;
    Some(((hours * 3600.0 + minutes * 60.0 + seconds) * 1000.0) as u64)
}

/// Milliseconds converted, from an FFmpeg progress line `out_time_us=…`.
fn progress_ms(line: &str) -> Option<u64> {
    line.trim()
        .strip_prefix("out_time_us=")?
        .parse::<u64>()
        .ok()
        .map(|us| us / 1000)
}

/// Converts a file the page may read into a web-ready one and returns its bytes. A data file
/// under `media-work/` (a dropped file the page wrote) is removed afterwards.
#[tauri::command]
pub async fn media_convert<R: Runtime>(
    app: AppHandle<R>,
    tasks: State<'_, Tasks>,
    job: String,
    input: PathBuf,
    kind: String,
    on_progress: Channel<[u64; 2]>,
) -> Result<Response, String> {
    let place = checked(&app, &input)?;
    let video = match kind.as_str() {
        "video" => true,
        "audio" => false,
        _ => return Err(format!("invalid: no such media kind {kind}")),
    };
    let (install, work) = folders(&app)?;
    if !is_installed(&install) {
        return Err("not-found: the media converter is not installed".into());
    }
    let dropped = place == Place::Data
        && crate::files::data_dir(&app)
            .map(|data| input.starts_with(data.join("media-work")))
            .unwrap_or(false);
    let cancel = tasks.start(&job);
    let output = work.join(format!("{job}.{}", if video { "webm" } else { "mp3" }));
    let result = tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            fs::create_dir_all(&work).map_err(|e| e.to_string())?;
            convert(&install, &input, &output, video, &cancel, &on_progress)?;
            fs::read(&output).map_err(|e| e.to_string())
        })();
        let _ = fs::remove_file(&output);
        if dropped {
            let _ = fs::remove_file(&input);
        }
        result
    })
    .await
    .map_err(|e| e.to_string());
    tasks.end(&job);
    result?.map(Response::new)
}

fn convert(
    install: &Path,
    input: &Path,
    output: &Path,
    video: bool,
    cancel: &AtomicBool,
    progress: &Channel<[u64; 2]>,
) -> Result<(), String> {
    let mut child = command(&converter_exe(install))
        .args(convert_args(input, output, video))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("cannot start the converter: {e}"))?;
    // stderr names the duration and, on failure, why; stdout carries the progress lines.
    let total = Arc::new(Mutex::new(0u64));
    let last_lines = Arc::new(Mutex::new(Vec::<String>::new()));
    let stderr = child.stderr.take().map(|stream| {
        let (total, last_lines) = (total.clone(), last_lines.clone());
        std::thread::spawn(move || {
            for line in BufReader::new(stream).lines().map_while(Result::ok) {
                if let (Some(ms), Ok(mut total)) = (duration_ms(&line), total.lock()) {
                    *total = (*total).max(ms);
                }
                if let Ok(mut lines) = last_lines.lock() {
                    lines.push(line);
                    let excess = lines.len().saturating_sub(5);
                    lines.drain(..excess);
                }
            }
        })
    });
    let stdout = child.stdout.take().map(|stream| {
        let (total, progress) = (total.clone(), progress.clone());
        std::thread::spawn(move || {
            for line in BufReader::new(stream).lines().map_while(Result::ok) {
                if let (Some(done), Ok(total)) = (progress_ms(&line), total.lock()) {
                    let _ = progress.send([done.min(*total), *total]);
                }
            }
        })
    });
    let ok = wait(&mut child, cancel, || {});
    for thread in [stderr, stdout].into_iter().flatten() {
        let _ = thread.join();
    }
    if ok? {
        return Ok(());
    }
    let why = last_lines
        .lock()
        .map(|lines| lines.join("\n"))
        .unwrap_or_default();
    Err(format!("the file could not be converted: {why}"))
}

/// Stops the download or conversion with this job id; nothing happens when none runs.
#[tauri::command]
pub fn media_cancel(tasks: State<'_, Tasks>, job: String) {
    if let Ok(tasks) = tasks.0.lock()
        && let Some(flag) = tasks.get(&job)
    {
        flag.store(true, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pin_is_an_https_github_release_of_an_lgpl_build() {
        assert!(PIN.url.starts_with("https://github.com/"), "{}", PIN.url);
        assert!(PIN.licence.starts_with("LGPL-"), "{}", PIN.licence);
        assert_eq!(PIN.sha256.len(), 64);
        assert!(PIN.sha256.bytes().all(|b| b.is_ascii_hexdigit()));
        assert!(PIN.url.contains(&PIN.folder));
    }

    #[test]
    fn arguments_are_fixed_around_the_two_paths() {
        let input = Path::new(r"C:\Courses\clip one.mov");
        let output = Path::new(r"C:\work\job.webm");
        let args = convert_args(input, output, true);
        assert_eq!(args[4], input.as_os_str());
        assert_eq!(args.last().unwrap(), output.as_os_str());
        let text: Vec<_> = args.iter().map(|arg| arg.to_string_lossy()).collect();
        assert!(text.contains(&"libvpx-vp9".into()) && text.contains(&"libopus".into()));
        let audio: Vec<_> = convert_args(input, output, false)
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert!(audio.contains(&"libmp3lame".to_owned()) && audio.contains(&"-vn".to_owned()));
    }

    #[test]
    fn reads_the_duration_and_the_progress() {
        assert_eq!(
            duration_ms("  Duration: 00:01:02.50, start: 0.000000, bitrate: 128 kb/s"),
            Some(62_500)
        );
        assert_eq!(duration_ms("Duration: N/A, bitrate: N/A"), None);
        assert_eq!(progress_ms("out_time_us=1500000"), Some(1500));
        assert_eq!(progress_ms("out_time_us=N/A"), None);
        assert_eq!(progress_ms("frame=12"), None);
    }
}

# Releasing the desktop app

The Windows installer (M2-19; D-2, D-29) is built by `.github/workflows/release.yml` on a version
tag (`v*`), or when the workflow is started by hand. It builds Tauri's NSIS installer on
`windows-latest`, writes `SHA256SUMS.txt` and attaches both to a **draft** release. Only the
project lead tags, runs the release workflows, edits releases and sets secrets.

| Workflow | Runs on | What it does |
|---|---|---|
| `release.yml` | a pushed `v*` tag, or Run workflow | Installer and checksums on a draft release `v<version>` |
| `mirror-media-tool.yml` | Run workflow only | Copies the pinned FFmpeg build to this repository's release (D-49) |

## Once, before the first release

- [ ] **Mirror the media converter (D-49).** Actions, *Mirror media converter*, Run workflow on
  `main`. It downloads the build named in `apps/desktop/src-tauri/media-tool.json` from its
  `upstream` address, checks size and SHA-256, and uploads it unchanged to the release named after
  the build (`ffmpeg-n9.0.2-…`, a pre-release that is never "latest"), then downloads it from there
  and checks it again. The app downloads it from that release (`url`) and checks the same SHA-256,
  so until this has run, adding a video that needs converting fails with a download error. Run it
  again whenever the pin changes. If the mirror is ever lost, set `url` back to `upstream` in a
  reviewed pull request: the SHA-256 stays the same, and both are GitHub releases (ADR-0004).
- [ ] **Signing, when it is bought (D-2).** Desktop 0.1 ships unsigned with published checksums,
  and the workflow says so in a notice. To sign, add two repository secrets: `WINDOWS_CERTIFICATE`,
  the code-signing certificate and its key as a base64 `.pfx`
  (`[Convert]::ToBase64String([IO.File]::ReadAllBytes("signing.pfx"))` in PowerShell), and
  `WINDOWS_CERTIFICATE_PASSWORD`. The workflow then imports it, and Tauri signs the app, the
  installer and its uninstaller with SHA-256 and a DigiCert timestamp. A cloud signing service
  without a `.pfx` needs Tauri's `signCommand` instead.
- [ ] **Name and identifier (D-30, D-34).** "Course Suite" and `org.iteratecraft.coursesuite` are
  working values. Change them before the first public release: the identifier names the app data
  folder, and the product name names the install folder, the Start menu entry and the uninstall
  entry, so a later change leaves the old ones behind on every machine.

## Each release

1. [ ] `main` is green, and the Moodle job too.
2. [ ] Bump `version` in `apps/desktop/package.json` (the installer, the app and its About text
   read it, and the executable's file version) in a pull request, and merge it. The crate's own
   version in `Cargo.toml` is not used.
3. [ ] Tag the merged commit and push the tag:

   ```bash
   git tag -a v0.1.0 -m "Course Suite 0.1.0"
   git push origin v0.1.0
   ```

   The workflow fails if the tag is not `v` plus that version. Started by hand instead, it builds
   the branch it runs on into a draft for `v<version>`; publishing that draft creates the tag.
4. [ ] Wait for the *Release* workflow (about 15 minutes). A second run for the same version
   replaces the files of the draft; a published release is never changed.
5. [ ] In the draft, download `Course-Suite_<version>_x64-setup.exe` and check it against
   `SHA256SUMS.txt`: `Get-FileHash .\Course-Suite_<version>_x64-setup.exe` in PowerShell.
6. [ ] On a clean Windows 10 and Windows 11 (Windows Sandbox will do), without administrator
   rights: run the installer (an unsigned one shows SmartScreen's *More info*, *Run anyway*); the
   app is in the Start menu as *Course Suite*; create a course, save it as a `.crs` file, add a
   video that needs converting (the converter downloads from the mirror); close and reopen it; then
   uninstall it from *Settings*, *Apps*. The `.crs` file is still there.
7. [ ] On a Windows machine with the repository, the installer test measures the same build:
   `INSTALLER_E2E=1 pnpm --filter @course-suite/desktop exec playwright test --project installer`
   (it installs into your user profile and uninstalls again; see `apps/desktop/README.md`).
8. [ ] Write the release notes (M2-22) above the checksums in the draft, and publish it.

A mistake in a published release is fixed by a new version, never by changing its files or moving
its tag.

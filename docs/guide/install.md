# Install and uninstall

[User guide](README.md) › Install and uninstall

Course Suite 0.1 runs on **Windows 10 and Windows 11, 64-bit**. It installs for your own Windows
account only, so you do not need administrator rights. The installer is about 2.5 MB.

## Download

1. Open the project's releases page: <https://github.com/iteratecraft/studio/releases>.
2. Under the newest **Course Suite** release, download two files:
   - `Course-Suite_<version>_x64-setup.exe`, the installer (for 0.1.0:
     `Course-Suite_0.1.0_x64-setup.exe`);
   - `SHA256SUMS.txt`, the checksum of the installer.

## Check the download

Version 0.1 is **not code-signed**: Windows cannot tell you who made it. The checksum lets you
check that the file you downloaded is exactly the one the project published, so do this before you
run it.

1. Open the Start menu, type **PowerShell** and open **Windows PowerShell**.
2. Go to the folder you downloaded to. For the **Downloads** folder, type this and press **Enter**:

   ```powershell
   cd $HOME\Downloads
   ```

3. Type this, with your version number, and press **Enter**:

   ```powershell
   Get-FileHash .\Course-Suite_0.1.0_x64-setup.exe
   ```

4. Open `SHA256SUMS.txt` in Notepad. It holds one line: the checksum (64 letters and digits), a
   space, a `*` and the file name:

   ```text
   <64 letters and digits> *Course-Suite_0.1.0_x64-setup.exe
   ```

5. Compare the **Hash** that PowerShell printed with the 64 letters and digits at the start of that
   line. PowerShell prints capital letters and the file has small ones; that difference does not
   matter. Every letter and digit must match.

If they do not match, do not run the installer: download it again from the releases page. If it
still does not match, tell the project by opening an issue on GitHub.

## Install

1. Double-click `Course-Suite_0.1.0_x64-setup.exe`.
2. Windows may show a blue **Windows protected your PC** window, because the installer is not
   code-signed. Choose **More info**, check that the file name is the one you checked above, then
   choose **Run anyway**.
3. Follow the installer's steps. On its last page you can untick **Create desktop shortcut** if you
   do not want an icon on your desktop.
4. Open **Course Suite** from the Start menu (or the desktop icon).

The app is installed in `%LOCALAPPDATA%\Course Suite` (for example
`C:\Users\<you>\AppData\Local\Course Suite`).

Course Suite draws its window with **Microsoft Edge WebView2**, which Windows 11 and an up-to-date
Windows 10 already have. On a computer without it, the installer first downloads and installs
WebView2 from Microsoft. On a computer with no internet access, ask your administrator to install
the WebView2 runtime first; the installer then downloads nothing.

## What the app stores, and where

| What | Where |
|---|---|
| Your courses | `.crs` files, wherever you save them ([Your courses](courses.md)) |
| Work saved automatically while you edit | A hidden folder next to each course file, named `.<file name>.autosave` |
| Your course list, your settings, your own fonts, small copies of course covers, and the media converter | The app's data folder, `%LOCALAPPDATA%\org.iteratecraft.coursesuite` |
| The app itself | `%LOCALAPPDATA%\Course Suite` |

## Uninstall

1. Open Windows **Settings**, then **Apps** (on Windows 11, **Apps** › **Installed apps**).
2. Find **Course Suite**, choose **Uninstall** (on Windows 11, the **…** button first) and confirm.

Uninstalling removes the app, its shortcuts and its entry in **Apps**. It keeps:

- **your course files**, wherever you saved them: the app never deletes a course file;
- the app's data folder (your course list, settings, fonts and the media converter), so a later
  install finds them again.

To remove the data folder too, tick **Delete the application data** in the uninstaller. Your course
files are never in that folder, so they stay either way.

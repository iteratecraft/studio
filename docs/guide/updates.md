# Updates

[User guide](README.md) › Updates

Course Suite can update itself to a new version from the project's releases on GitHub. It never
downloads or installs anything until you agree.

## Automatic checks

When the app starts, it checks whether there is a newer version, if all of these are true:

- **Check for updates automatically** is on (it is, unless you turn it off);
- the computer is online;
- the last check was a day ago or more.

This check is quiet: you hear from it only when there is a new version.

## Check now

Two ways to check at once, whether automatic checks are on or off:

- in the menu bar of the window, **Help** › **Check for updates…**;
- on **Your courses**, **Settings**, then **Check now**.

The app then says what it found: **You have the latest version of Course Suite**, a new version, or
why it could not check (for example **You are offline**).

## Install an update

When there is a new version, the app shows **Course Suite <version> is available**, with **What
changed**, which gives the address of that version's release notes:

1. Choose **Install and restart**, or **Not now** to keep working with your version.
2. The update downloads, with its progress. You can cancel it.
3. The app checks that the download carries the project's signature. A download without it is
   never installed.
4. If an open course has unsaved changes, the app asks, as when you close it: **Save**, **Don't
   save** or **Cancel**. **Cancel** stops the update: your course stays open and your version keeps
   working; check again when you are ready.
5. The installer runs with a progress bar and no questions, replaces the app, and starts the new
   version. It takes about a minute.

Your course files, your course list, your fonts and your settings stay as they are.

If anything goes wrong (no connection, the release site cannot be reached, the download is not
signed by the project), the app says so in plain words and your current version keeps working.

## Turn automatic checks off

On **Your courses**, choose **Settings** and turn off **Check for updates automatically**, then
**Done**. The app then contacts the release site only when you choose **Check for updates…** or
**Check now**.

## What a check sends

A check asks GitHub, where the project publishes its releases, for the newest version number. It
sends nothing about you or your courses. The app offers only published releases, never drafts or
test versions.

You can also install a new version by hand at any time: download it from the releases page and
run it ([Install and uninstall](install.md)). It installs over the old version and keeps your
courses and settings.

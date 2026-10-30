# Pictures, audio, video and embeds

[User guide](README.md) › Pictures, audio, video and embeds

Every place that holds a file (an image block, a video, a question's picture, the cover, a lesson
header, a narration) works the same way:

- choose the button (**Choose an image**, **Choose audio**, **Choose a video**, **Choose a file**)
  and pick the file, or
- drag the file from File Explorer and drop it on the dashed box (**or drop a file here**).

The file is copied into the course file, so the course keeps working if you move or delete the
original. A file you add twice is kept once. A file can be at most 2 GB. If a file cannot be added,
a notice lists it with the reason.

## Pictures

The editor takes JPG, PNG, GIF, WebP, AVIF, SVG and BMP pictures.

- Pictures more than 1920 pixels wide or high are made smaller, to keep the course quick to load.
  Tick **Keep the original quality** before you add a picture to keep it as it is.
- BMP pictures become PNG. SVG drawings and GIF animations are kept as they are.

Each picture has:

- **Alt text**: what the picture shows, read out by screen readers to people who cannot see it;
- **Decorative: screen readers skip it**, for a picture that adds nothing to the text.

A picture with neither is flagged under its alt text field, and in the checks before you export.
**Replace the image** puts another picture in its place (it needs its own alt text);
**Remove the picture** takes it out.

The theme's pictures (the cover picture, the logo and the lesson header picture) can also be
cropped ([Theme and fonts](theme.md)). Pictures in blocks cannot be cropped in 0.1.

## Audio and video

These files go straight in:

| | Files |
|---|---|
| Audio | MP3, M4A (AAC), WebM |
| Video | MP4 (H.264 video with AAC sound), WebM |

Other audio and video (for example WAV, FLAC, OGG, WMA, MOV, AVI, MKV or WMV) must be converted
first, so that every browser can play it. Course Suite does that on your computer:

1. The first time you add such a file, the app asks **Download the media converter?** It names the
   converter (FFmpeg, free software under the LGPL licence), its size (about 77 MB) and where it
   comes from (a public release on GitHub).
2. Choose **Download**. The app downloads it once, checks it and keeps it in its own data folder.
   Choose **Not now** to download nothing: the file is then not added.
3. The file is converted, with its progress shown; **Cancel** stops it. Video becomes WebM and
   audio becomes MP3. Your original file is not changed.

Later files are converted without asking again. Nothing is uploaded: conversion happens on your
computer.

An **Audio** or **Video** block has **Learners can skip ahead** on by default. Turn it off to make
learners play the file to the end; a continue block can then wait for it ([Continue
blocks](navigation.md#continue-blocks)).

A video can have a **Thumbnail**: the picture shown before it plays.

## Captions

A video can have caption files in **WebVTT** format (`.vtt`), one for each language.

1. In the video's **Captions**, type the **Language code of a new caption file**, such as `en`,
   `fr` or `pt-BR`.
2. Choose **Add a caption file** and pick the `.vtt` file.

A file that does not start with `WEBVTT`, or has times that cannot be read, is refused with the
line at fault. For each caption file:

- **Edit the … captions** opens the caption editor: each caption's text, and when it **Starts at**
  and **Ends at** (as `00:01:02.500`). In a caption's text, **Enter** splits it at the cursor,
  **Backspace** at its start joins it to the caption before, and **Delete** at its end joins the
  one after. **Add a caption** and **Remove caption …** add and remove captions. Saving keeps the
  changes as one step to undo.
- **Save a copy of the … captions** saves the caption file where you choose.
- **Remove the … captions** takes it off the video.

Learners turn captions on and off in the video player.

## Web embeds

A **Web page or embed** block, and the media of interactive items, can show a video from
**YouTube**, **Vimeo**, **Loom** or **Dailymotion**:

1. Copy the video's address from your browser, or its embed code from the site's share options.
2. Paste it into **Web address or embed code**. The block says **Plays from …** with the site's
   name. An address from another site is refused.

Learners' browsers load the video from that site only when the learner chooses to play it, and
only while they are online. In the app's preview, the block shows where the video will play but
does not load it.

## Files to download

A **File to download** block takes any file, such as a PDF checklist or a spreadsheet. Learners see
its name and size, and your **Description**, and can save it.

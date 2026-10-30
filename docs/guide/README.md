# Course Suite user guide

This guide is for course authors. It covers **Course Suite 0.1 for Windows**: what it does, step
by step, in the words you see on screen. You do not need to have used a course authoring app
before.

Course Suite is a desktop app for building online courses. You write a course as a scroll of
**blocks** (text, pictures, video, questions and more), check it in a preview, and export it as a
package that a learning system, or any web server, can play.

## Pages

| Page | What it covers |
|---|---|
| [Install and uninstall](install.md) | Getting the app, checking the download, the Windows warning, removing it |
| [Your courses](courses.md) | The start screen, course files (`.crs`), saving, and getting work back after a crash |
| [The course editor](editor.md) | The top bar, the course overview, the outline, lessons, undo and redo |
| [Working with blocks](blocks.md) | Adding blocks, the block library, block tools, style and format, copy and paste |
| [Block types](block-types.md) | Every block you can add, and its settings |
| [Pictures, audio, video and embeds](media.md) | Adding files, the media converter, captions, embedded videos |
| [Knowledge checks and quizzes](questions.md) | Questions inside a lesson, and quiz lessons with a score |
| [Continue blocks and navigation](navigation.md) | How learners move through a course, and what they must finish first |
| [Theme and fonts](theme.md) | Colours, fonts, the cover page and lesson headers |
| [Preview](preview.md) | Trying the course as a learner, at computer, tablet and phone width |
| [Publish and export](publish.md) | Settings for each output, and what to upload where |
| [Updates](updates.md) | How the app updates itself, and how to turn that off |
| [Keyboard use](keyboard.md) | Working without a mouse, and every shortcut |
| [What 0.1 does not do yet](limits.md) | Known limits, and what comes in later versions |

The [release notes for 0.1.0](../releases/0.1.0.md) sum up this version. In versions after 0.1.0,
**Help** › **User guide** in the app's menu bar opens this guide in your web browser.

## Your first course in ten steps

1. Install the app ([Install and uninstall](install.md)) and open **Course Suite** from the Start
   menu. You see **Your courses**.
2. Choose **New**, then **Blank course**. Type a title, for example *Lifting safely*, and choose
   **Create**.
3. Choose where to save the course file. It is saved as `Lifting safely.crs`, and the course opens.
4. Under **Outline**, type the title of the first lesson and press **Enter**. Add more lessons the
   same way. **Shift+Enter** adds a section header instead, to group the lessons under it.
5. Choose **Open** beside a lesson.
6. Choose a block in the bar at the end of the lesson, or **All blocks** for every type. The block
   appears with sample text: replace it with your own.
7. Choose **Theme** in the top bar to pick colours and fonts, then **Save** and **Back to the
   course**.
8. Choose **Preview** to see the course as learners will, then **Edit** to go back.
9. Press **Ctrl+S** to save the course file.
10. Choose **Publish**, pick an output (for a learning system, **SCORM 1.2** is the default), then
    **Export** and choose where to save the zip. Upload that zip to your learning system, and save
    the course again: it keeps the version number of the package.

![Your courses, with two courses as cards](images/dashboard.png)

## Words used in this guide

| Word | Meaning |
|---|---|
| Course | A cover page, an outline of lessons, and optional quizzes |
| Microlearning | A short course of one lesson, without an outline or quizzes |
| Lesson | One page of a course, made of blocks |
| Section header | A title in the outline that groups the lessons below it |
| Quiz | A lesson of questions with a score at the end |
| Block | One piece of a lesson: a paragraph, a picture, a video, a question… |
| Learning system | The site your organisation uses to give courses to learners and record their results (often called an LMS) |
| Package | The zip file you export and upload, or put on a web server |
| Learner | A person who takes the course |

The guide's pictures are made from sample content by a script in this repository
(`apps/web/e2e/guide.e2e.ts`), so they can be taken again when the app changes.

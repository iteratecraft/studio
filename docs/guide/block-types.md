# Block types

[User guide](README.md) › Block types

Every block type you can add in 0.1, by its group in the block library. For each: what you edit
in the block, and what its **Format** menu adds to the common options ([Format](blocks.md#format)).
Every block also has **Style** and, except headings and subheadings, **Narration**
([Working with blocks](blocks.md)).

Settings you leave as they are take the defaults shown. Colours are typed as `#` and six digits or
letters a to f, such as `#2f6f9f`; leave a colour empty for the theme's.

## Text

| Type | What you edit | Format |
|---|---|---|
| **Paragraph** | **Text** (formatted) | **Text columns**: One, Two or Three |
| **Paragraph with heading**, **Paragraph with subheading** | **Heading** or **Subheading**, and **Text** | **Heading level**, **Text columns**, **Space after the heading** |
| **Heading**, **Subheading** | The heading | **Heading level** |
| **Columns** | Two to four columns, each with **Text** and, if turned on, a picture | **Columns**: Two, Three or Four; **A picture above each column** |
| **Table** | **First row is a header**; each cell as formatted text; **Add row**, **Add column**, **Remove last row**, **Remove last column** | **Space inside cells** |

**Heading level** tells screen readers how the page is built: the lesson title is level 1, so
headings start at **Level 2** and go one level down for each sub-part, up to **Level 6**. The editor
offers only levels that do not skip one after the heading above. If a move or a deletion leaves a
heading too deep, the editor flags it.

## Statement

| Type | What you edit | Format |
|---|---|---|
| **Statement, plain**, **Statement, framed** | **Text**: one sentence worth remembering | — |
| **Statement, ruled**, **Statement, bold** | **Text** | **Show the rule**, **Rule thickness**, **Space around the rule** |
| **Note** | **Text**, and an **Icon** picture of your own instead of the built-in one, if you want | **Note size**, **Note colour** (and the text colour on it), **Show the icon**, **Icon colour**, **Corner rounding** |

## Quote

| Type | What you edit | Format |
|---|---|---|
| **Quote, plain**, **Quote, framed**, **Quote, with photo**, **Quote, large** | **Quote**, **Name** and a **Photo** | **Show the photo**, **Photo size**, **Show the quotation mark**, **Rule above the name** (and its thickness), **Space above the name** |
| **Quote over an image** | **Quote**, **Name** and a **Background picture** | **Show the quotation mark**, **Rule above the name**, **Space above the name**, **Alignment** (Left, Centre, Right), **Overlay colour**, **Overlay strength** |
| **Quote carousel** | Several quotes, each with **Quote**, **Name** and **Photo**, added, moved and removed | **Look of each quote** (one of the four looks above), and the photo, mark and name options |

## List

| Type | What you edit | Format |
|---|---|---|
| **Numbered list** | Items, added (**Add Item …**), moved and removed | **Space after the marker**, **Marker colour** (and, once set, the **Number colour** on it), **First number** |
| **Bulleted list** | Items | **Space after the marker**, **Marker colour** |
| **Checklist** | Items, which learners can tick | **Space after the marker**, **Marker colour** |

## Image

Every picture has **alt text** (what it shows, for people who cannot see it) or is marked
**Decorative** ([Pictures](media.md#pictures)).

| Type | What you edit | Format |
|---|---|---|
| **Centred image** | **Picture**, **Caption**, a **Link** | **Learners can enlarge pictures** (on), **Corner rounding** |
| **Full-width image** | **Picture**, **Caption**, a **Link** | **Learners can enlarge pictures** |
| **Image beside text** | **Picture**, its **Text**, a **Link** | **Learners can enlarge pictures**, **Corner rounding**, **Picture side** (Left or Right), **Picture size** |
| **Text over an image** | **Picture** and the text over it | **Overlay colour**, **Overlay strength** |
| **Banner** | **Picture**, a **Link** | **Learners can enlarge pictures** |

**Link** sends learners somewhere when they press the picture: a web address starting with
`https://`, or a lesson picked in **Link to a lesson**. A linked picture opens its link instead of
enlarging.

## Gallery

| Type | What you edit | Format |
|---|---|---|
| **Image carousel** | Pictures, one at a time, each with a **Caption** | **Learners can enlarge pictures**, **Corner rounding** |
| **Grid of two columns**, **Grid of three columns**, **Grid of four columns** | Pictures in a grid | **Learners can enlarge pictures**, **Corner rounding** |

**Add images** takes several pictures at once. Each picture can be moved and removed.

## Multimedia

[Pictures, audio, video and embeds](media.md) explains how files come in.

| Type | What you edit |
|---|---|
| **Audio** | The audio file, **Caption**, **Transcript**, **Learners can skip ahead** (on) |
| **Video** | The video file, **Caption**, caption files ([Captions](media.md#captions)), **Transcript**, **Thumbnail**, **Learners can skip ahead** (on), **Learners can change the playback speed** (on, for every video of the course), **Corner radius** |
| **Web page or embed** | **Web address or embed code** of a video from YouTube, Vimeo, Loom or Dailymotion, **Caption**, **Show a border** |
| **File to download** | **Choose a file** (any file), its **Description**; learners see its name and size |
| **Code snippet** | **Code**, shown exactly as typed, which learners can copy; **Language** (its name, shown above it, up to 40 characters) and a caption. Format: **Wrap long lines**, **Code colour** and **Text colour** |

Turn **Learners can skip ahead** off when learners must play the audio or video to the end: a
continue block can then wait for it.

## Interactive

Each section, tab, marker, step and card has its own media: **Shows** **Nothing**, **A picture**
(with alt text), **A video** (with captions) or **A web embed**, and **Add audio**, with the
**Audio player** **Below the text** or **Above the text** (set in **Format**).

| Type | What you edit | Format |
|---|---|---|
| **Accordion** | Sections, each a **Title**, formatted text and media; added, moved and removed. Learners open them one by one | **Open one section at a time**, **Learners can enlarge pictures**, **Audio player**, **Heading level** of the titles |
| **Tabs** | Tabs, each a **Title**, formatted text and media | **Learners can enlarge pictures**, **Audio player** |
| **Labelled image** | A picture, and markers on it, each with a **Title**, text, media and what the **Marker shows** (**Its number**, **Plus sign**, **Information sign**, **Question mark**, **Star**, **Pin** or **Eye**) | **Marker colour**, **Number and icon colour**, **Corner rounding**, **Learners can enlarge pictures**, **Audio player**, **Heading level** |
| **Process** | An **Introduction**, steps and a **Summary**, each with a **Title**, text and media; any of them can be **Hidden from learners** | **A word before each step number** and the **Word before the number**, **Learners can enlarge pictures**, **Audio player**, **Heading level** |
| **Flashcard grid**, **Flashcard stack** | Cards, each with a **Front** and a **Back**, and media on each side, placed **Centred, with a frame** or **Across the whole card** | **Show a hint to turn the cards over**, **Cards fit their content** or a **Smallest card height** |
| **Button**, **Button stack** | A **Heading**, and one or more buttons, each with a **Label**, **Text beside the button** and where it **Goes to** (below) | **Show the descriptions**, **Alignment**, **Button width** (Fits the label, Wide, Full width), **Button colour**, **Space between buttons** (stack), **Heading level**, **Corner rounding** |

Markers of a labelled image: choose the picture first. Click the picture to add a marker there, or
**Add a marker in the middle**. Drag a marker to move it, or move to it and use the **arrow keys**
(**Shift** with an arrow moves it further).

A button **Goes to**:

| Choice | What you give |
|---|---|
| **Another lesson** | The **Lesson** |
| **A web address** | A **Web address** starting with `https://` or `http://`; it opens in a new tab |
| **A page next to the course** | An **Address next to the course**, such as `handbook/index.html`; it opens in a new tab |
| **An email** | One or more **Email addresses**, separated by commas; the learner's mail app opens a message with the course title as its subject |
| **Exit the course (learning systems only)** | Nothing: it ends the course in a learning system. Web packages leave this button out |

If the lesson a single button led to is deleted, the block says it has no button and offers **Add a
button**.

## Knowledge check

**Single choice**, **Multiple response**, **Fill in the blank** and **Matching**: see [Knowledge
checks and quizzes](questions.md).

## Divider

| Type | What you edit | Format |
|---|---|---|
| **Continue** | What learners must finish before they go on, and the button's text: see [Continue blocks](navigation.md#continue-blocks) | **Button colour**, **Button width**, **Corner rounding** |
| **Line** | — | — |
| **Numbered divider** | — | **Start counting again**, and the **Number shown** |
| **Space** | — | — |

A numbered divider counts on from the numbered divider above it, unless it starts counting again.

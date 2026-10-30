# Continue blocks and navigation

[User guide](README.md) › Continue blocks and navigation

Two things decide how learners move through a course: **continue blocks** inside a lesson, and the
course's **navigation** settings in the theme.

## Continue blocks

A **Continue** block (in the block library's **Divider** group, or the bar at the end of a lesson)
is a button. Everything below it stays hidden until the learner presses it, so a lesson can unfold
step by step.

**Learners can go on**:

| Choice | Learners can press the button… |
|---|---|
| **Right away** (default) | at once |
| **When the block directly above is done** | once they have finished the block just above |
| **When every block since the last continue block is done** | once they have finished every block between the previous continue block and this one |

Under the choice, the block lists what **Learners must finish**. Blocks that learners can finish are
tagged **Can be required** in the lesson: for example a knowledge check, an audio or video that
learners must play to the end (**Learners can skip ahead** off), or interactive blocks such as an
accordion, whose parts they must open. A block with nothing to finish, such as a paragraph, cannot
be required: if the block directly above is one, the editor refuses **When the block directly above
is done** and says why.

The block's own text:

- **Button label**: leave it empty for the default label.
- **Hint while the button waits**: shown instead of the button until the learner has finished what
  is required. Leave it empty for the default hint.

Its **Format** menu adds **Button colour** (empty: the theme's button colour; the editor shows how
readable text is on it, and warns below 4.5 to 1), **Button width** (20 to 100 %) and **Corner
rounding**.

## Navigation of a course

Choose **Theme** in the top bar, then **Navigation**. The preview beside the settings shows each
change. Choose **Save** to keep the changes (one step to undo), or **Cancel**.

### Menu

| Setting | Default | What it does |
|---|---|---|
| **Course menu** | On | Off: learners start from the cover page and see no menu and no search |
| **Menu type** | **Sidebar** | **Sidebar**: beside the content; on small screens behind a menu button. **Compact menu**: a small card at the bottom left that opens the contents. **Overlay menu**: a large card that opens over the page |
| **Sidebar starts open** | On | On small screens it always starts closed |
| **Section groups start expanded** | On | Not for the overlay menu |
| **Menu colours** | **Light** | **Gray**, **Theme colour**, **Theme tint**, **Dark**, **Dark theme colour**, or the cover picture under a light or dark layer (**Cover picture, light**, **Cover picture, dark**). The menu's text is black or white, whichever reads better |
| **Lesson progress mark** | **Theme default** | The status in words under each lesson; a **Circle that fills** as the lesson is done; or **Done or not done**, a tick once it is done |
| **Lesson count in the card** | On | Compact menu only: the card shows which lesson is open, as its number of the total |
| **Course search** | On | Learners search lesson titles and content from the sidebar |
| **Lessons open in order** | Off | Learners finish each lesson before the next one opens |
| **Learners can mark lessons done** | Off | Learners can mark a lesson done themselves (lessons only, never quizzes) |

Some settings rule out others, and the panel says why:

- **Course search** is only in the sidebar menu, and is off while lessons open in order.
- **Learners can mark lessons done** is off while lessons open in order.
- A quiz that lets learners who pass skip ahead makes lessons open in order; the panel names the
  quiz ([Quiz settings](questions.md#quiz-settings)).

### Buttons

| Setting | Default | What it does |
|---|---|---|
| **Previous and next lesson buttons** | On | Turn them off for a branching course that moves learners on with button blocks |
| **Placement** | **Full width** | **Full width**: at the top and the foot of each lesson. **Floating**: small buttons that stay at the bottom of the screen. **Floating full width**: a bar across the bottom of the screen with both lesson titles |
| **Button colour** | **White** | **White**, **Dark**, **Theme colour** or **Theme tint**. The theme colour is shaded where needed to stay readable |

## A microlearning

A microlearning has no menu. Its **Navigation** section sets **How learners move through it**:

- **Continuous scroll**: the whole lesson on one page;
- **Steps**: one step at a time. Each block is a step, unless its **Format** menu has **Show with
  the next block in one step** on. Pick the **Step indicator**: **Plain bar**, **Numbered** or
  **Hidden**.

A microlearning made from the **One idea, explained** template starts in steps. In steps, learners
use the **Up** and **Down arrow keys**, or the buttons, to move between steps.

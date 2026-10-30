# Knowledge checks and quizzes

[User guide](README.md) › Knowledge checks and quizzes

There are two ways to ask learners questions:

- a **knowledge check** is a block with one question, inside a lesson. Learners answer it as they
  read. It has no score;
- a **quiz** is a lesson of its own, with several questions and a score at the end. A quiz's result
  can decide whether a learner passes the course ([Publish and export](publish.md)).

Both use the same four question types.

## Question types

| Type | Learners… | You write |
|---|---|---|
| **Single choice** | pick one answer | The answers, and which one is **Correct** (exactly one) |
| **Multiple response** | pick every answer that applies | The answers, and which are **Correct** (one or more) |
| **Fill in the blank** | type the answer | The **Accepted answers**, one per line, up to 10, and whether **Capitals must match** (off by default) |
| **Matching** | drag each match onto its item, or pick one and then the other (with **Space** or a click). **Answer with drop-down lists** gives each item a drop-down list instead; **Answer by dragging** switches back | 2 to 10 pairs, each an **Item** and its **Match**, and the **Order learners see**: **Shuffle both columns**, **Keep the items in my order** or **Keep the matches in my order** |

Every question also has:

- the **Question**, as formatted text;
- **Picture, audio or video**: a picture or a video shown with the question, and an audio clip
  that can play beside either. A new file takes the place of the one before;
- **Feedback**: **One message for any answer**, **One for a right answer, one for a wrong one**,
  or, for single choice, **A message for each answer**.

Answers of choice questions are added (**Add Answer …**), moved up and down and removed; a question
keeps at least two. To add many answers at once, paste several lines into one answer: each line
becomes an answer.

**Question type** changes the type in place and keeps the question, its media and its feedback.
Between the choice types and fill in the blank, the answers and the right ones are kept too.

## Knowledge checks in a lesson

Add one from the block library's **Knowledge check** group. Learners answer it and choose **Check
answer**.

Its **Format** menu holds:

| Setting | Default | What it does |
|---|---|---|
| **Retries after a wrong answer** | **Unlimited** | Or a number from 0 to 10 |
| **Learners must answer right to see what follows** | Off | The rest of the lesson stays hidden until the answer is right |
| **Show the right answer after a wrong one** | On | |
| **Colour of right answers**, **Colour of wrong answers** | The standard colours | A colour of your own (below) |

If learners must answer right and their retries are limited, the editor warns you: a learner who
uses up the retries cannot see the rest of the lesson or finish the course.

## Quizzes

### Add a quiz

In the course overview, choose **Add**, then **Quiz** (or **Add quiz below** in a row's
**Actions**). Give it a title in the outline, and choose **Open**.

A quiz shows its **Quiz title**, **Description** and **Author shown on this lesson**, then its
**Questions**:

- **Add a question** and pick its type. The new question has sample content to replace.
- The list **Questions in order** names each question by its number, type and first words. Choose
  one to edit it on the right.
- Above the chosen question: **Move up**, **Move down**, **Duplicate** and **Delete**.

### Quiz settings

**Quiz settings** opens:

| Setting | Default | What it does |
|---|---|---|
| **Passing score** | 80 % | From 0 to 100 % |
| **Retries** | **Unlimited** | Or 0 to 10 more tries at the whole quiz |
| **Learners must pass to go on** | Off | Lessons after the quiz stay closed until the learner passes |
| **Let learners who pass skip ahead** | Off | Learners who pass jump to a later lesson (**Skip to**). It makes lessons open in order for the whole course. Optional: **Learners choose whether to skip**, and the **Skip button label**. Offered only when there is a lesson after the quiz |
| **Ask the questions in a random order** | Off | |
| **Shuffle the answers** | Off | |
| **After each answer show** | **Every answer, with feedback** | Or **Only wrong answers, with feedback**, or **Nothing** |
| **Colour of right answers**, **Colour of wrong answers** | The standard colours | |
| **Time limit** | Off | When on: its **Length** (10 minutes at first, 1 to 120), what the **Timer shows** (**Time left**, **Time taken** or **Time taken of the limit**) and whether **Learners can hide the timer** |
| **Count the quiz as a lesson** | On | Whether the quiz is numbered in the lesson count that lesson headers show |
| **Button after the result** | **Next lesson link** | Or a **Continue button** |

### What learners see

The quiz shows one question at a time. Learners answer and submit, see the feedback you chose, and
go on. At the end a results page shows their score and whether they passed, with a way to try again
while they have retries left.

## Colours of right and wrong answers

The colours you pick must be easy to read: at least 4.5 to 1 against white, or against the block's
background. A colour that is too light is flagged with one that would work, and learners see the
standard colour until you change it.

On a block with a picture background and **Keep cards white** off, the marks stay white or black,
and the editor says so.

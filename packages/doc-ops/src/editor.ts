// The editing session of one author: the current document, undo and redo, and change events.
import type { Course } from "@course-suite/format";
import type { ApplyResult, Command } from "./commands.js";
import { applyCommands, documentErrors } from "./commands.js";
import type { Op } from "./ops.js";
import { applyOps } from "./ops.js";

/** What changed, for autosave, snapshots and change detection. */
export interface ChangeEvent {
  document: Course;
  /** Ids of the objects changed, added or removed, and of the objects holding them. */
  ids: string[];
  /** The ops that turned the previous document into this one. */
  ops: readonly Op[];
  source: "do" | "undo" | "redo";
}

export interface EditorOptions {
  /** Undo steps kept (UI-PUBCOLLAB-R38: 50). */
  historyLimit?: number;
}

export interface Editor {
  /** The current document. Never change it: every edit makes a new one, sharing what it kept. */
  readonly document: Course;
  /**
   * Applies one command, or a list of them as one unit: all or nothing, one undo step, one change
   * event. A rejected list changes nothing.
   */
  dispatch(commands: Command | readonly Command[]): ApplyResult;
  undo(): boolean;
  redo(): boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Until the matching endGroup, every dispatch joins one undo step (an AI insert made of several
   * tool calls, say). Groups nest; undo or redo closes the open step. */
  beginGroup(): void;
  endGroup(): void;
  /** Forgets every undo and redo step (UI-BLOCKS-EDITOR-R15: leaving the lesson). */
  clearHistory(): void;
  /** Calls the listener after every change; returns a function that stops it. */
  subscribe(listener: (event: ChangeEvent) => void): () => void;
}

interface Step {
  ops: Op[];
  inverse: Op[];
  ids: string[];
}

/** Starts an editing session on a valid course document; throws if it is not valid. */
export function createEditor(course: Course, options: EditorOptions = {}): Editor {
  const errors = documentErrors(course);
  if (errors.length > 0) {
    const first = errors[0];
    throw new Error(`Invalid course document: ${first?.path} ${first?.message}`);
  }
  const limit = options.historyLimit ?? 50;
  let document = course;
  let done: Step[] = [];
  let undone: Step[] = [];
  let depth = 0;
  // Whether the top undo step belongs to the open group.
  let joining = false;
  const listeners = new Set<(event: ChangeEvent) => void>();
  const emit = (ops: readonly Op[], ids: string[], source: ChangeEvent["source"]) => {
    for (const listener of [...listeners]) listener({ document, ids, ops, source });
  };
  const replay = (from: Step[], to: Step[], undo: boolean): boolean => {
    const step = from.pop();
    if (!step) return false;
    joining = false;
    const ops = undo ? step.inverse : step.ops;
    document = applyOps(document, ops).root;
    to.push(step);
    emit(ops, step.ids, undo ? "undo" : "redo");
    return true;
  };

  return {
    get document() {
      return document;
    },
    dispatch(commands) {
      const list = Array.isArray(commands) ? commands : [commands as Command];
      const result = applyCommands(document, list);
      if (!result.ok || result.ops.length === 0) return result;
      document = result.document;
      undone = [];
      const top = done.at(-1);
      if (joining && top) {
        top.ops.push(...result.ops);
        top.inverse.unshift(...result.inverse);
        top.ids = [...new Set([...top.ids, ...result.ids])];
      } else {
        // The step owns its arrays: a later dispatch in the group grows them, and must not change
        // the ops of a change event already sent or of a result already returned.
        done.push({ ops: [...result.ops], inverse: [...result.inverse], ids: result.ids });
        if (done.length > limit) done.shift();
        joining = depth > 0;
      }
      emit(result.ops, result.ids, "do");
      return result;
    },
    undo: () => replay(done, undone, true),
    redo: () => replay(undone, done, false),
    get canUndo() {
      return done.length > 0;
    },
    get canRedo() {
      return undone.length > 0;
    },
    beginGroup() {
      depth += 1;
    },
    endGroup() {
      depth = Math.max(0, depth - 1);
      if (depth === 0) joining = false;
    },
    clearHistory() {
      done = [];
      undone = [];
      joining = false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

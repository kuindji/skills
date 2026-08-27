import type { Diagnostic } from "../profile/types";

/**
 * The rules for a tracker that is a file in the repository.
 *
 * With ClickUp or Linear, "issue state lives in the tracker and nowhere else"
 * holds by construction: there is one system, it owns status, and a markdown
 * file cannot pretend otherwise. Move the tracker in-repo and that guarantee
 * disappears. The file is prose, so nothing stops a second heading, a second
 * copy of a task id, or a task marked done with no evidence that it is.
 *
 * These checks give the file back the properties the external system had for
 * free. A task's state is its section, so the sections come from a fixed set
 * and an id may appear under only one of them. Done means evidence, not that
 * the code exists, so a Done row without an `evidence:` line is a violation
 * rather than a style lapse: it is the one rule that survives the move from an
 * external tracker to a file, and the only thing keeping "done" honest.
 */

/** The four states a task can be in. A section heading names one of them. */
export const TRACKER_SECTIONS = [
    "Todo",
    "In progress",
    "Blocked",
    "Done",
] as const;

export type TrackerSection = (typeof TRACKER_SECTIONS)[number];

/** `## Done` */
const HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t]*$/;
/**
 * `- [x] \`P2-03\` docs-validate: lifecycle class`
 *
 * All three list markers, because a tracker written with `*` rather than `-`
 * renders identically and would otherwise be a file where every rule here
 * silently finds nothing to check.
 */
const TASK_RE = /^([ \t]*)[-*+][ \t]+\[([ xX])\][ \t]*(.*)$/;
/** The opening or closing line of a fenced code block. */
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/;
/** A continuation line under a task, carrying its evidence. */
const EVIDENCE_RE = /^[ \t]+evidence:[ \t]*(\S.*)$/;

/**
 * The id a task opens with, as an inline code span.
 *
 * A code span is any run of backticks closed by a run of the same length, so
 * ``` ``P1-01`` ``` is one as much as `` `P1-01` `` is. Reading only the
 * single-backtick form told an author who had written a perfectly good span
 * to put their id in backticks, and let the same id in two spellings sit in
 * two sections without being seen as one task.
 */
function leadingId(text: string): string | undefined {
    const ticks = /^`+/.exec(text)?.[0];
    if (ticks === undefined) {
        return undefined;
    }
    const rest = text.slice(ticks.length);
    const close = rest.indexOf(ticks);
    if (close < 0) {
        return undefined;
    }
    const id = rest.slice(0, close).trim();
    return id === "" ? undefined : id;
}

export interface TrackerTask {
    id?: string;
    section: TrackerSection;
    /** 1-based line the task row sits on. */
    line: number;
    checked: boolean;
    text: string;
    evidence?: string;
}

/**
 * Check the file named by `tracker.file` when the backend is in-repo.
 *
 * Pure: takes the file's text rather than reading it, because every rule here
 * is about the shape of the markdown and none of them need a repository.
 */
export function validateTrackerFile(
    path: string,
    source: string,
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    // A lone \r is a line ending too. Splitting on \n alone turned a
    // CR-only file into one enormous line, where no heading and no task row
    // matched and the file came back clean.
    const lines = source.split(/\r\n|[\r\n]/);

    let section: TrackerSection | undefined;
    const seenSections = new Map<TrackerSection, number>();
    const tasks: TrackerTask[] = [];
    /** The last top-level task row, which an indented row belongs to. */
    let parent: number | undefined;
    let fence: string | undefined;
    let commented = false;

    for (const [ index, raw ] of lines.entries()) {
        const lineNumber = index + 1;

        // A tracker file that shows its own format holds rows and headings
        // that are examples, not state. Reading them as real ones reports
        // faults on a correct file, which is how a validator gets switched
        // off. Code fences and HTML comments are the two ways a markdown file
        // says "this is not content", and both are read here for that reason.
        //
        // A fence outranks a comment, because inside one nothing is markup at
        // all, and it closes only on the same character and at least its own
        // length: a file showing a fenced example inside a fenced example
        // would otherwise reopen at the inner fence and read the rest of it
        // as state.
        if (fence !== undefined) {
            const closing = FENCE_RE.exec(raw)?.[1];
            if (
                closing !== undefined && closing[0] === fence[0]
                && closing.length >= fence.length
            ) {
                fence = undefined;
            }
            continue;
        }

        const visible = stripComments(raw, commented);
        commented = visible.commented;
        const line = visible.text;

        const opening = FENCE_RE.exec(line)?.[1];
        if (opening !== undefined) {
            fence = opening;
            continue;
        }

        const heading = HEADING_RE.exec(line);
        if (heading && heading[1]?.length === 2) {
            parent = undefined;
            const title = heading[2] ?? "";
            const known = matchSection(title);
            if (known === undefined) {
                // Every task's state is the section it sits under. A heading
                // outside the fixed set is a fifth state that nothing else in
                // the system knows how to read.
                section = undefined;
                diagnostics.push({
                    file: path,
                    keyPath: "",
                    line: lineNumber,
                    rule: "docs.trackerSection",
                    message: `\`## ${title}\` is not one of the sections a `
                        + "tracker file has.",
                    remedy: "Use one of: "
                        + `${TRACKER_SECTIONS.join(", ")}. A task's state is `
                        + "the section it is under, so a heading outside that "
                        + "set puts its tasks in a state nothing can read. "
                        + "Notes about the tracker belong above the first "
                        + "section.",
                    severity: "error",
                });
                continue;
            }

            const earlier = seenSections.get(known);
            if (earlier !== undefined) {
                diagnostics.push({
                    file: path,
                    keyPath: "",
                    line: lineNumber,
                    rule: "docs.trackerSection",
                    message:
                        `A second \`## ${known}\` section. The first is on `
                        + `line ${earlier}.`,
                    remedy: "Merge them. Two sections with one name split the "
                        + "state they hold, and which half a reader finds "
                        + "depends on where they stop scrolling.",
                    severity: "error",
                });
            }
            else {
                seenSections.set(known, lineNumber);
            }
            section = known;
            continue;
        }

        const task = TASK_RE.exec(line);
        if (!task) {
            continue;
        }
        const text = (task[3] ?? "").trim();

        // An indented row is part of the task above it, the way its evidence
        // is: breaking one task into steps is ordinary, and demanding an id
        // and a section for each step would make the ordinary case a fault.
        // Indented under nothing is the case that matters, because it is a
        // whole list the rules below would otherwise never see.
        if ((task[1] ?? "") !== "") {
            if (parent === undefined) {
                diagnostics.push({
                    file: path,
                    keyPath: "",
                    line: lineNumber,
                    rule: "docs.trackerOrphan",
                    message:
                        "This row is indented under no task, so it is neither "
                        + "a task nor a step of one.",
                    remedy:
                        "Unindent it to make it a task in its own right, with "
                        + "an id, or put it under the task it is a step of. "
                        + "Indented under nothing, it holds state that nothing "
                        + "checks.",
                    severity: "error",
                });
            }
            continue;
        }
        parent = lineNumber;

        if (section === undefined) {
            diagnostics.push({
                file: path,
                keyPath: "",
                line: lineNumber,
                rule: "docs.trackerOrphan",
                message: "This task is not under any of the tracker's "
                    + "sections, so it has no state.",
                remedy: "Move it under "
                    + `${TRACKER_SECTIONS.join(", ")}, whichever is true of `
                    + "it. A checkbox is not a state: the section is.",
                severity: "error",
            });
            continue;
        }

        tasks.push({
            id: leadingId(text),
            section,
            line: lineNumber,
            checked: (task[2] ?? " ") !== " ",
            text,
            evidence: findEvidence(lines, index),
        });
    }

    for (const task of tasks) {
        checkId(path, task, diagnostics);
        checkCheckbox(path, task, diagnostics);
        checkEvidence(path, task, diagnostics);
    }
    checkUniqueIds(path, tasks, diagnostics);

    return diagnostics;
}

/**
 * The evidence line belonging to the task on `taskIndex`.
 *
 * Evidence is written as indented continuation lines under the row, which is
 * how it reads in a rendered list and how it stays attached to its task
 * through an edit. The block ends at the first line that is not indented
 * continuation: the next task, the next heading, or a blank line.
 */
function findEvidence(
    lines: string[],
    taskIndex: number,
): string | undefined {
    for (let index = taskIndex + 1; index < lines.length; index++) {
        const line = lines[index] ?? "";
        // The next task row is not indented, so the same test that ends the
        // block ends it there too.
        if (line.trim() === "" || !/^[ \t]/.test(line)) {
            return undefined;
        }
        const evidence = EVIDENCE_RE.exec(line);
        if (evidence) {
            return evidence[1]?.trim();
        }
    }
    return undefined;
}

/**
 * A task carries an id.
 *
 * Without one there is nothing to name the task by in a commit message, a
 * session log or a conversation, and nothing to check for duplication. The id
 * goes in an inline code span at the start of the row so it survives being
 * quoted and is visible in a rendered list.
 */
function checkId(path: string, task: TrackerTask, out: Diagnostic[]): void {
    if (task.id !== undefined && task.id !== "") {
        return;
    }
    out.push({
        file: path,
        keyPath: "",
        line: task.line,
        rule: "docs.trackerId",
        message: "This task does not open with an id.",
        remedy: "Start the row with the id in backticks, as in ``- [ ] `P2-04` "
            + "…``. An id is what a commit, a session log or a review can "
            + "name the task by; a description cannot be referred to.",
        severity: "error",
    });
}

/**
 * The checkbox agrees with the section.
 *
 * Both encode state, and when they disagree the file holds two answers with
 * nothing to choose between them. The section wins by design, so the checkbox
 * is required to follow it rather than to be believed.
 */
function checkCheckbox(
    path: string,
    task: TrackerTask,
    out: Diagnostic[],
): void {
    const shouldBeChecked = task.section === "Done";
    if (task.checked === shouldBeChecked) {
        return;
    }
    out.push({
        file: path,
        keyPath: "",
        line: task.line,
        rule: "docs.trackerCheckbox",
        message: task.checked
            ? `\`[x]\` under \`## ${task.section}\`, which is not a finished `
                + "state."
            : `\`[ ]\` under \`## Done\`.`,
        remedy: shouldBeChecked
            ? "Tick it, or move it out of Done."
            : "Untick it, or move it to Done with an `evidence:` line. The "
                + "section is what holds state; a checkbox that disagrees with "
                + "it makes the file say two things at once.",
        severity: "error",
    });
}

/**
 * Done requires evidence.
 *
 * This is the rule the whole class exists for. "Done means the tracker says
 * done and something proves it, not that the code exists" is trivial to
 * enforce where a tracker is a system with required fields, and trivial to
 * skip where it is a markdown file. A row ticked with nothing under it is
 * exactly the claim nobody can check.
 */
function checkEvidence(
    path: string,
    task: TrackerTask,
    out: Diagnostic[],
): void {
    if (task.section !== "Done" || task.evidence !== undefined) {
        return;
    }
    out.push({
        file: path,
        keyPath: "",
        line: task.line,
        rule: "docs.trackerEvidence",
        message: `\`${task.id ?? task.text}\` is under Done with no `
            + "`evidence:` line.",
        remedy:
            "Add an indented `evidence:` line under the row naming the command "
            + "that proves it and what it reported. Where the product declares "
            + "checklist globs, name the rows ticked. Code existing is not "
            + "evidence that it works.",
        severity: "error",
    });
}

/**
 * An id names one task, in one section.
 *
 * The duplicate that matters is the one across sections: the same work sitting
 * in Todo and in Done, which is how a tracker comes to disagree with itself
 * about what is finished. A duplicate inside one section is the milder case
 * and gets the milder message, but both make the id useless as a name.
 */
function checkUniqueIds(
    path: string,
    tasks: TrackerTask[],
    out: Diagnostic[],
): void {
    const byId = new Map<string, TrackerTask[]>();
    for (const task of tasks) {
        if (task.id === undefined || task.id === "") {
            continue;
        }
        byId.set(task.id, [ ...byId.get(task.id) ?? [], task ]);
    }

    for (const [ id, group ] of byId) {
        if (group.length < 2) {
            continue;
        }
        const first = group[0]!;
        const sections = new Set(group.map((task) => task.section));
        for (const task of group.slice(1)) {
            out.push({
                file: path,
                keyPath: "",
                line: task.line,
                rule: "docs.trackerDuplicateId",
                message: sections.size > 1
                    ? `\`${id}\` is under \`## ${task.section}\` here and `
                        + `\`## ${first.section}\` on line ${first.line}, so `
                        + "the tracker holds two states for it."
                    : `\`${id}\` is already used on line ${first.line}.`,
                remedy: sections.size > 1
                    ? "Delete the row that is not true. State lives in one "
                        + "place, and with two rows the answer depends on "
                        + "which one a reader finds."
                    : "Give this task its own id. An id that names two tasks "
                        + "names neither.",
                severity: "error",
            });
        }
    }
}

/**
 * A line with its HTML comments removed, and whether one is still open.
 *
 * A commented-out heading or row is prose about the tracker, not state in it.
 * Reading it as state reported a missing evidence line against a task that
 * had been deliberately taken out of the file.
 */
function stripComments(
    line: string,
    open: boolean,
): { text: string; commented: boolean; } {
    let text = "";
    let rest = line;
    let commented = open;

    while (rest !== "") {
        if (commented) {
            const end = rest.indexOf("-->");
            if (end < 0) {
                break;
            }
            rest = rest.slice(end + 3);
            commented = false;
            continue;
        }
        const start = rest.indexOf("<!--");
        if (start < 0) {
            text += rest;
            break;
        }
        text += rest.slice(0, start);
        rest = rest.slice(start + 4);
        commented = true;
    }

    return { text, commented };
}

/** The section a heading names, matched case-insensitively. */
function matchSection(title: string): TrackerSection | undefined {
    const wanted = title.trim().toLowerCase();
    return TRACKER_SECTIONS.find(
        (section) => section.toLowerCase() === wanted,
    );
}

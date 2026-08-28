import type { Diagnostic } from "../profile/types";

/**
 * How a validator says what it found.
 *
 * The house rule these tools are held to is that a validator reports the file,
 * the line, the rule, and what to do about it, because they run against repos
 * whose authors did not write the rule being enforced. So every diagnostic
 * prints all four, and the remedy is never abbreviated away: a reader who has
 * to go looking for what "invalid frontmatter" means is reading a bug.
 */

export interface Io {
    out(line: string): void;
    err(line: string): void;
}

/** Writes to the process's own streams. */
export const consoleIo: Io = {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
};

/** Exit codes, shared by every bin so a caller can branch on them. */
export const EXIT = {
    /** Nothing wrong, or nothing worse than a warning. */
    ok: 0,
    /** The repository has problems the tool is there to find. */
    failed: 1,
    /** The tool could not run: bad arguments, no profile, no repository. */
    unusable: 2,
} as const;

export interface ReportOptions {
    /** The bin's name, used in the summary line. */
    tool: string;
    /**
     * Counts and context printed above the summary. Facts a reader needs to
     * judge a clean run: a wiki validator reporting no problems over zero
     * pages is saying something quite different from one reporting none over
     * a hundred and fifty.
     */
    notes?: string[];
    /** Emit one JSON object instead of prose. */
    json?: boolean;
}

/**
 * Print a run's findings and return the exit code for them.
 *
 * Warnings do not fail. Every warning in this system is a judgement about
 * decay — a document that may be stale, a pattern that may be dead — and a
 * repository that cannot pass its own validator without silencing those stops
 * running the validator instead.
 */
export function report(
    io: Io,
    diagnostics: Diagnostic[],
    options: ReportOptions,
): number {
    const errors = diagnostics.filter((d) => d.severity === "error");
    const warnings = diagnostics.filter((d) => d.severity === "warning");

    if (options.json === true) {
        io.out(JSON.stringify(
            {
                tool: options.tool,
                errors: errors.length,
                warnings: warnings.length,
                notes: options.notes ?? [],
                diagnostics,
            },
            null,
            2,
        ));
        return errors.length > 0 ? EXIT.failed : EXIT.ok;
    }

    for (const line of formatDiagnostics(diagnostics)) {
        io.out(line);
    }
    if (diagnostics.length > 0) {
        io.out("");
    }
    for (const note of options.notes ?? []) {
        io.out(note);
    }
    io.out(summary(options.tool, errors.length, warnings.length));

    return errors.length > 0 ? EXIT.failed : EXIT.ok;
}

/**
 * Render diagnostics, errors first and grouped by file.
 *
 * Errors before warnings because the exit code is decided by the errors, and a
 * reader scrolling back through a long run should meet the failing half first.
 * Within a severity the order is by file and then by position, so a second run
 * over an unchanged repository prints the same thing in the same order.
 */
export function formatDiagnostics(diagnostics: Diagnostic[]): string[] {
    const lines: string[] = [];
    const ordered = [ ...diagnostics ].sort(compare);
    let lastFile: string | undefined;

    for (const diagnostic of ordered) {
        if (diagnostic.file !== lastFile) {
            if (lastFile !== undefined) {
                lines.push("");
            }
            lastFile = diagnostic.file;
        }
        lines.push(...formatDiagnostic(diagnostic));
    }
    return lines;
}

/** One diagnostic as a location line, the message, and the remedy. */
export function formatDiagnostic(diagnostic: Diagnostic): string[] {
    const where = location(diagnostic);
    const severity = diagnostic.severity === "error" ? "error" : "warning";
    return [
        `${where}  ${severity}  ${diagnostic.rule}`,
        ...wrap(diagnostic.message, "    "),
        ...wrap(`Fix: ${diagnostic.remedy}`, "    "),
    ];
}

/**
 * Where the problem is, as precisely as the diagnostic knows.
 *
 * A line number when there is one. Otherwise the YAML key, which is what a
 * profile diagnostic has: `project-profile.yaml:docs.lifecycle[0]` sends a
 * reader to the setting that is wrong, and the bare filename does not.
 */
function location(diagnostic: Diagnostic): string {
    if (diagnostic.line !== undefined) {
        return `${diagnostic.file}:${diagnostic.line}`;
    }
    if (diagnostic.keyPath !== "") {
        return `${diagnostic.file}:${diagnostic.keyPath}`;
    }
    return diagnostic.file;
}

function compare(a: Diagnostic, b: Diagnostic): number {
    if (a.severity !== b.severity) {
        return a.severity === "error" ? -1 : 1;
    }
    if (a.file !== b.file) {
        return a.file.localeCompare(b.file);
    }
    if ((a.line ?? 0) !== (b.line ?? 0)) {
        return (a.line ?? 0) - (b.line ?? 0);
    }
    return a.keyPath.localeCompare(b.keyPath) || a.rule.localeCompare(b.rule);
}

function summary(tool: string, errors: number, warnings: number): string {
    if (errors === 0 && warnings === 0) {
        return `${tool}: no problems.`;
    }
    return `${tool}: ${plural(errors, "error")}, `
        + `${plural(warnings, "warning")}.`;
}

/** `1 page`, `152 pages`. Shared so every count reads the same way. */
export function plural(n: number, noun: string): string {
    return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * Wrap prose to a terminal width, indented under its location line.
 *
 * A remedy is a sentence or three, and an unwrapped one is unreadable in the
 * 80-column terminal these tools are actually read in.
 */
export function wrap(text: string, indent: string, width = 80): string[] {
    const limit = Math.max(20, width - indent.length);
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
        let current = "";
        for (const word of paragraph.split(/\s+/).filter((w) => w !== "")) {
            if (current === "") {
                current = word;
            }
            else if (current.length + 1 + word.length <= limit) {
                current = `${current} ${word}`;
            }
            else {
                lines.push(indent + current);
                current = word;
            }
        }
        lines.push(indent + current);
    }
    return lines;
}

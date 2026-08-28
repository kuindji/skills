import { describe, expect, test } from "bun:test";
import type { Diagnostic } from "../profile/types";
import { EXIT, formatDiagnostics, report, wrap } from "./report";

function sink() {
    const lines: string[] = [];
    const errors: string[] = [];
    return {
        io: {
            out: (line: string) => lines.push(line),
            err: (line: string) => errors.push(line),
        },
        text: () => lines.join("\n"),
        lines,
        errors,
    };
}

function diagnostic(over: Partial<Diagnostic> = {}): Diagnostic {
    return {
        file: "docs/a.md",
        keyPath: "",
        rule: "docs.rule",
        message: "Something is wrong.",
        remedy: "Do this about it.",
        severity: "error",
        ...over,
    };
}

describe("report", () => {
    test("an error fails the run, a warning does not", () => {
        expect(
            report(sink().io, [ diagnostic({ severity: "warning" }) ], {
                tool: "t",
            }),
        ).toBe(EXIT.ok);
        expect(report(sink().io, [ diagnostic() ], { tool: "t" })).toBe(
            EXIT.failed,
        );
    });

    /**
     * A validator that prints nothing on a clean run is indistinguishable
     * from one that did not run, and the counts are how a reader tells a wiki
     * of 152 pages with no problems from a wiki of none.
     */
    test("a clean run still says so, and still reports its scope", () => {
        const out = sink();
        report(out.io, [], { tool: "wiki-validate", notes: [ "152 pages." ] });
        expect(out.lines).toEqual([
            "152 pages.",
            "wiki-validate: no problems.",
        ]);
    });

    test("every diagnostic carries file, rule, message and remedy", () => {
        const out = sink();
        report(out.io, [ diagnostic({ line: 12 }) ], { tool: "t" });
        expect(out.text()).toContain("docs/a.md:12  error  docs.rule");
        expect(out.text()).toContain("Something is wrong.");
        expect(out.text()).toContain("Fix: Do this about it.");
    });

    test("a profile diagnostic without a line points at the key", () => {
        const out = sink();
        report(out.io, [
            diagnostic({
                file: "project-profile.yaml",
                keyPath: "docs.live[0]",
            }),
        ], { tool: "t" });
        expect(out.text()).toContain("project-profile.yaml:docs.live[0]");
    });

    test("--json carries the same findings with the counts", () => {
        const out = sink();
        const code = report(out.io, [
            diagnostic(),
            diagnostic({ severity: "warning" }),
        ], { tool: "t", json: true, notes: [ "2 documents." ] });
        const parsed = JSON.parse(out.text());
        expect(code).toBe(EXIT.failed);
        expect(parsed.errors).toBe(1);
        expect(parsed.warnings).toBe(1);
        expect(parsed.notes).toEqual([ "2 documents." ]);
        expect(parsed.diagnostics).toHaveLength(2);
    });
});

describe("formatDiagnostics", () => {
    test("errors come before warnings, then file, then line", () => {
        const lines = formatDiagnostics([
            diagnostic({ file: "b.md", line: 2, severity: "warning" }),
            diagnostic({ file: "b.md", line: 9 }),
            diagnostic({ file: "a.md", line: 3 }),
        ]);
        const locations = lines.filter((line) =>
            line.includes("  error  ")
            || line.includes("  warning  ")
        );
        expect(locations).toEqual([
            "a.md:3  error  docs.rule",
            "b.md:9  error  docs.rule",
            "b.md:2  warning  docs.rule",
        ]);
    });

    test("ordering does not depend on the order found", () => {
        const one = formatDiagnostics([
            diagnostic({ file: "a.md", line: 1 }),
            diagnostic({ file: "b.md", line: 1 }),
        ]);
        const other = formatDiagnostics([
            diagnostic({ file: "b.md", line: 1 }),
            diagnostic({ file: "a.md", line: 1 }),
        ]);
        expect(one).toEqual(other);
    });
});

describe("wrap", () => {
    test("keeps every word and fits the width", () => {
        const text = "one two three four five six seven eight nine ten "
            + "eleven twelve thirteen fourteen fifteen sixteen";
        const lines = wrap(text, "    ", 40);
        expect(lines.every((line) => line.length <= 40)).toBe(true);
        expect(lines.join(" ").trim().split(/\s+/)).toEqual(text.split(" "));
    });

    test("a word longer than the width is not broken", () => {
        const long = "a".repeat(60);
        expect(wrap(long, "  ", 40)).toEqual([ `  ${long}` ]);
    });
});

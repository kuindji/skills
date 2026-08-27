import { describe, expect, test } from "bun:test";
import { validateTrackerFile } from "./tracker";

const PATH = "docs/tasks.md";

function rules(source: string): string[] {
    return validateTrackerFile(PATH, source).map((d) => d.rule);
}

/** The shape this repo's own tracker uses, as the baseline. */
const CLEAN = `# Tasks

Notes about the tracker live above the first section.

## Todo

- [ ] \`P2-05\` docs-freeze

## In progress

- [ ] \`P2-04\` docs-validate: live, tracker and no-class-match

## Blocked

## Done

- [x] \`P2-03\` docs-validate: lifecycle class
      evidence: bun test skills/lib/docs — 73 pass
`;

describe("a well-formed tracker", () => {
    test("reports nothing", () => {
        expect(validateTrackerFile(PATH, CLEAN)).toEqual([]);
    });

    test("empty sections are fine, and so is an empty file", () => {
        expect(rules("## Todo\n\n## Done\n")).toEqual([]);
        expect(rules("")).toEqual([]);
    });

    test("a heading matches its section whatever its case", () => {
        expect(rules("## TODO\n\n- [ ] `A1` a task\n")).toEqual([]);
        expect(rules("## in progress\n\n- [ ] `A1` a task\n")).toEqual([]);
    });
});

/**
 * Each of these was a real bypass or false positive in the first version,
 * found by pointing the parser at the markdown a tracker file actually
 * contains rather than at the shape it is supposed to have.
 */
describe("what the parser reads as a task", () => {
    test("a fenced example of the format is not state", () => {
        // The file documenting its own shape reported a duplicate id and a
        // missing evidence line against rows that are an illustration.
        expect(
            rules(
                "## Todo\n\n- [ ] `A1` real\n\nThe format is:\n\n```\n"
                    + "## Done\n- [x] `A1` example\n```\n",
            ),
        ).toEqual([]);
    });

    test("a tilde fence closes with tildes, not with backticks", () => {
        expect(
            rules("## Todo\n\n~~~\n- [x] `A1` example\n~~~\n"),
        ).toEqual([]);
    });

    test("rows after the fence closes are read again", () => {
        expect(
            rules(
                "## Done\n\n```\n- [x] `A1` example\n```\n\n- [x] `A2` real\n",
            ),
        ).toEqual([ "docs.trackerEvidence" ]);
    });

    test("a longer fence holds a shorter one", () => {
        // Found by the gpt-5.5 review. Closing on the marker character alone
        // reopened at the inner fence and read the rest of the example as
        // state.
        expect(
            rules(
                "## Todo\n\n````\n- [x] `A1` example\n```\n"
                    + "- [x] `A2` still an example\n````\n",
            ),
        ).toEqual([]);
    });

    test("a tracker written with `*` or `+` markers is still checked", () => {
        // Both render as a list identically to `-`, so a tracker using them
        // was a file where every rule here found nothing at all.
        expect(rules("## Done\n\n* [x] `A1` one\n")).toEqual([
            "docs.trackerEvidence",
        ]);
        expect(rules("## Done\n\n+ [x] `A1` one\n")).toEqual([
            "docs.trackerEvidence",
        ]);
    });

    test("an indented row is a step of the task above, not a task", () => {
        // Breaking a task into steps is ordinary. Demanding an id and a
        // section for each step made the ordinary case a fault.
        expect(
            rules(
                "## Todo\n\n- [ ] `A1` the task\n  - [ ] write the tests\n"
                    + "  - [ ] run them\n",
            ),
        ).toEqual([]);
    });

    test("a step does not inherit its parent's need for evidence", () => {
        expect(
            rules(
                "## Done\n\n- [x] `A1` the task\n      evidence: bun test\n"
                    + "  - [x] wrote the tests\n",
            ),
        ).toEqual([]);
    });

    test("evidence is still found past the steps it follows", () => {
        expect(
            rules(
                "## Done\n\n- [x] `A1` the task\n  - [x] wrote the tests\n"
                    + "      evidence: bun test\n",
            ),
        ).toEqual([]);
    });

    test("a commented-out example is not state", () => {
        // Found by the gpt-5.5 review. A row taken out of the file with an
        // HTML comment was still read as a task, so removing one reported a
        // fault against it.
        expect(
            rules("## Todo\n\n<!--\n## Done\n- [x] `A1` not a task\n-->\n"),
        ).toEqual([]);
    });

    test("a comment that opens and closes on one line hides only itself", () => {
        expect(
            rules(
                "## Done\n\n- [x] `A1` one <!-- was A0 -->\n"
                    + "      evidence: bun test\n",
            ),
        ).toEqual([]);
    });

    test("a comment inside a fence is part of the example", () => {
        expect(
            rules("## Todo\n\n```\n<!--\n```\n\n- [x] `A1` real\n"),
        ).toEqual([ "docs.trackerCheckbox" ]);
    });

    test("a file written with CR line endings is still read", () => {
        // Found by the gpt-5.5 review. Splitting on \n alone made a CR-only
        // file one enormous line, matching nothing, and it came back clean.
        const diagnostics = validateTrackerFile(
            PATH,
            "## Done\r\r- [ ] `A1` one\r      evidence: bun test\r",
        );
        expect(diagnostics.map((d) => d.rule)).toEqual([
            "docs.trackerCheckbox",
        ]);
        expect(diagnostics[0]?.line).toBe(3);
    });

    test("a row indented under nothing is neither task nor step", () => {
        // A tracker indented throughout would otherwise report nothing at
        // all, which reads exactly like a clean file.
        const diagnostics = validateTrackerFile(
            PATH,
            "## Done\n\n  - [x] `A1` one\n",
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.rule).toBe("docs.trackerOrphan");
        expect(diagnostics[0]?.line).toBe(3);
    });

    test("a heading ends the task its rows could belong to", () => {
        expect(
            rules("## Todo\n\n- [ ] `A1` one\n\n## Done\n\n  - [x] step\n"),
        ).toEqual([ "docs.trackerOrphan" ]);
    });
});

describe("sections come from the fixed set", () => {
    test("an unknown heading is an error", () => {
        const diagnostics = validateTrackerFile(
            PATH,
            "## Todo\n\n## Someday\n\n- [ ] `A1` a task\n",
        );
        expect(diagnostics[0]?.rule).toBe("docs.trackerSection");
        expect(diagnostics[0]?.line).toBe(3);
    });

    test("a task under an unknown heading has no state", () => {
        expect(rules("## Someday\n\n- [ ] `A1` a task\n")).toEqual([
            "docs.trackerSection",
            "docs.trackerOrphan",
        ]);
    });

    test("a task before any section has no state", () => {
        const diagnostics = validateTrackerFile(
            PATH,
            "# Tasks\n\n- [ ] `A1` a task\n\n## Todo\n",
        );
        expect(diagnostics[0]?.rule).toBe("docs.trackerOrphan");
        expect(diagnostics[0]?.line).toBe(3);
    });

    test("two sections with one name split the state they hold", () => {
        const diagnostics = validateTrackerFile(
            PATH,
            "## Done\n\n## Todo\n\n## Done\n",
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.rule).toBe("docs.trackerSection");
        expect(diagnostics[0]?.message).toContain("line 1");
    });

    // A level-3 heading is prose structure inside a section, not a state.
    test("only level-2 headings are sections", () => {
        expect(
            rules("## Todo\n\n### Later this month\n\n- [ ] `A1` a task\n"),
        ).toEqual([]);
    });
});

describe("every task carries an id", () => {
    test("a task with no id cannot be named", () => {
        const diagnostics = validateTrackerFile(
            PATH,
            "## Todo\n\n- [ ] finish the thing\n",
        );
        expect(diagnostics[0]?.rule).toBe("docs.trackerId");
        expect(diagnostics[0]?.line).toBe(3);
    });

    test("an id has to open the row, not sit inside it", () => {
        expect(rules("## Todo\n\n- [ ] finish `A1` at some point\n")).toEqual([
            "docs.trackerId",
        ]);
    });

    test("a double-backtick span is a code span too", () => {
        // Found by the gpt-5.5 review. The id was rejected with a remedy
        // telling its author to use backticks, which is what they had done,
        // and the same id in two spellings escaped the duplicate check.
        expect(rules("## Todo\n\n- [ ] ``A1`` one\n")).toEqual([]);
        const diagnostics = validateTrackerFile(
            PATH,
            "## Todo\n\n- [ ] ``A1`` one\n\n## Done\n\n- [x] `A1` one\n"
                + "      evidence: bun test\n",
        );
        expect(diagnostics.map((d) => d.rule)).toEqual([
            "docs.trackerDuplicateId",
        ]);
    });

    test("the same id twice in one section names neither task", () => {
        const diagnostics = validateTrackerFile(
            PATH,
            "## Todo\n\n- [ ] `A1` one\n- [ ] `A1` another\n",
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.rule).toBe("docs.trackerDuplicateId");
        expect(diagnostics[0]?.line).toBe(4);
        expect(diagnostics[0]?.message).toContain("already used on line 3");
    });

    test("the same id in two sections is two states for one task", () => {
        const diagnostics = validateTrackerFile(
            PATH,
            "## Todo\n\n- [ ] `A1` one\n\n## Done\n\n- [x] `A1` one\n"
                + "      evidence: bun test\n",
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.rule).toBe("docs.trackerDuplicateId");
        expect(diagnostics[0]?.message).toContain("two states");
    });
});

describe("Done means evidence", () => {
    test("a Done task with no evidence line is an error", () => {
        const diagnostics = validateTrackerFile(
            PATH,
            "## Done\n\n- [x] `A1` shipped it\n",
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.rule).toBe("docs.trackerEvidence");
        expect(diagnostics[0]?.message).toContain("`A1`");
    });

    test("evidence must be attached to the row, not to the section", () => {
        // Unindented, so it is prose under the list rather than this task's
        // evidence, and the next reader cannot tell which task it proves.
        expect(
            rules("## Done\n\n- [x] `A1` shipped it\nevidence: bun test\n"),
        ).toEqual([ "docs.trackerEvidence" ]);
    });

    test("evidence is not borrowed from the task above", () => {
        const diagnostics = validateTrackerFile(
            PATH,
            "## Done\n\n- [x] `A1` one\n      evidence: bun test\n"
                + "- [x] `A2` another\n",
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.message).toContain("`A2`");
    });

    test("a blank line ends the evidence block", () => {
        expect(
            rules("## Done\n\n- [x] `A1` one\n\n      evidence: bun test\n"),
        ).toEqual([ "docs.trackerEvidence" ]);
    });

    test("an empty evidence line proves nothing", () => {
        expect(rules("## Done\n\n- [x] `A1` one\n      evidence:\n")).toEqual([
            "docs.trackerEvidence",
        ]);
    });

    test("evidence over several lines is read from the first", () => {
        expect(
            rules(
                "## Done\n\n- [x] `A1` one\n      evidence: bun test — 73 pass,\n"
                    + "      and the fixture repo reports 6 documents\n",
            ),
        ).toEqual([]);
    });

    test("only Done requires it", () => {
        expect(rules("## Todo\n\n- [ ] `A1` one\n")).toEqual([]);
        expect(rules("## In progress\n\n- [ ] `A1` one\n")).toEqual([]);
        expect(rules("## Blocked\n\n- [ ] `A1` one\n")).toEqual([]);
    });
});

describe("the checkbox follows the section", () => {
    test("a ticked task outside Done says two things at once", () => {
        const diagnostics = validateTrackerFile(
            PATH,
            "## In progress\n\n- [x] `A1` one\n",
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.rule).toBe("docs.trackerCheckbox");
        expect(diagnostics[0]?.message).toContain("In progress");
    });

    test("an unticked task under Done is the same fault", () => {
        expect(
            rules("## Done\n\n- [ ] `A1` one\n      evidence: bun test\n"),
        ).toEqual([ "docs.trackerCheckbox" ]);
    });

    test("an upper-case X ticks the box", () => {
        expect(
            rules("## Done\n\n- [X] `A1` one\n      evidence: bun test\n"),
        ).toEqual([]);
    });
});

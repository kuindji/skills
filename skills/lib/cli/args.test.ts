import { describe, expect, test } from "bun:test";
import { parseArgs, preflight, value, values } from "./args";

const SPEC = {
    booleans: [ "json", "dry-run", "help" ],
    values: [ "repo", "acknowledge" ],
    aliases: { h: "help", n: "dry-run" },
};

describe("parseArgs", () => {
    test("separates positionals from flags", () => {
        const args = parseArgs([ "docs/a.md", "--json", "docs/b.md" ], SPEC);
        expect(args.positionals).toEqual([ "docs/a.md", "docs/b.md" ]);
        expect(args.booleans.has("json")).toBe(true);
        expect(args.errors).toEqual([]);
    });

    test("takes a value attached or detached", () => {
        expect(value(parseArgs([ "--repo=/tmp/x" ], SPEC), "repo")).toBe(
            "/tmp/x",
        );
        expect(value(parseArgs([ "--repo", "/tmp/x" ], SPEC), "repo")).toBe(
            "/tmp/x",
        );
    });

    test("a repeatable flag keeps every value in order", () => {
        const args = parseArgs(
            [ "--acknowledge", "a.ts", "--acknowledge", "b.ts" ],
            SPEC,
        );
        expect(values(args, "acknowledge")).toEqual([ "a.ts", "b.ts" ]);
    });

    test("aliases resolve to the long name", () => {
        const args = parseArgs([ "-n", "-h" ], SPEC);
        expect(args.booleans.has("dry-run")).toBe(true);
        expect(args.booleans.has("help")).toBe(true);
    });

    /**
     * The reason the parser is strict at all. An agent that mistypes a flag
     * has no way to notice that its `--dry-run` was ignored: the run succeeds
     * and writes the files it was told not to touch.
     */
    test("an unknown flag is an error, not a positional", () => {
        const args = parseArgs([ "--dryrun" ], SPEC);
        expect(args.positionals).toEqual([]);
        expect(args.errors).toEqual([ "Unknown option `--dryrun`." ]);
    });

    test("a boolean given a value is an error", () => {
        expect(parseArgs([ "--dry-run=yes" ], SPEC).errors).toEqual([
            "`--dry-run` takes no value.",
        ]);
    });

    test("a value flag at the end of the line is an error", () => {
        expect(parseArgs([ "--repo" ], SPEC).errors).toEqual([
            "`--repo` needs a value.",
        ]);
    });

    test("after -- everything is a path", () => {
        const args = parseArgs([ "--", "--dry-run", "-x" ], SPEC);
        expect(args.positionals).toEqual([ "--dry-run", "-x" ]);
        expect(args.errors).toEqual([]);
        expect(args.booleans.has("dry-run")).toBe(false);
    });

    test("a bare - is a path, not a flag", () => {
        expect(parseArgs([ "-" ], SPEC).positionals).toEqual([ "-" ]);
    });
});

describe("preflight", () => {
    function io() {
        const out: string[] = [];
        const err: string[] = [];
        return {
            out: (line: string) => out.push(line),
            err: (line: string) => err.push(line),
            outLines: out,
            errLines: err,
        };
    }

    test("--help prints the usage and exits 0", () => {
        const sink = io();
        expect(preflight([ "--help" ], SPEC, "USAGE", sink)).toBe(0);
        expect(sink.outLines).toEqual([ "USAGE" ]);
    });

    test("a bad flag prints the reason and the usage, and exits 2", () => {
        const sink = io();
        expect(preflight([ "--nope" ], SPEC, "USAGE", sink)).toBe(2);
        expect(sink.errLines[0]).toBe("Unknown option `--nope`.");
        expect(sink.errLines).toContain("USAGE");
    });

    test("help wins over a bad flag, since one explains the other", () => {
        const sink = io();
        expect(preflight([ "--nope", "--help" ], SPEC, "USAGE", sink)).toBe(0);
    });
});

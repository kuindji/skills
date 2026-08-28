import { describe, expect, test } from "bun:test";
import { extractNames, MAX_NAMES_PER_PAGE } from "./extract";

/**
 * The heuristic that makes the drift worklist possible, held to what it
 * claims: it finds the names on a page, and it does not pretend that
 * everything in backticks is one.
 *
 * Every rejection here costs a page some coverage, and every acceptance costs
 * the worklist some noise. The bias is towards rejecting, because a name that
 * greps to four hundred files orders nothing.
 */

function page(body: string) {
    return { body, bodyStartLine: 1 };
}

function names(body: string): string[] {
    return extractNames(page(body)).map((n) => n.name);
}

describe("what counts as a name", () => {
    test("an inline code span is one", () => {
        expect(names("Pricing reads `rate_table` on every request.")).toEqual([
            "rate_table",
        ]);
    });

    test("call syntax keeps the name and drops the parentheses", () => {
        expect(names("Call `useToast()` from anywhere.")).toEqual([
            "useToast",
        ]);
    });

    test("a path is a name of its own kind", () => {
        const found = extractNames(page("See `skills/lib/wiki/graph.ts`."));
        expect(found).toEqual([
            { name: "skills/lib/wiki/graph.ts", kind: "path", line: 1 },
        ]);
    });

    test("a symbol is the other kind", () => {
        expect(extractNames(page("`OrdersTable` holds them."))[0]?.kind).toBe(
            "symbol",
        );
    });

    test("a line reference is read as the path it decorates", () => {
        // The validator already errors on this. The sweep still has to do
        // something with the page in front of it, and the path half of a
        // banned citation is a perfectly good name.
        expect(names("`skills/lib/wiki/graph.ts:101-110` does it.")).toEqual([
            "skills/lib/wiki/graph.ts",
        ]);
    });

    test("prose outside backticks is not a name", () => {
        expect(names("The rate table is read on every request.")).toEqual([]);
    });

    /**
     * A fence shows the shape of a contract, and the tokens in it are a
     * rendering of that shape rather than names the page is about. Taking
     * them would make a page carrying one YAML example watch every file that
     * mentions `title`.
     */
    test("a fenced block contributes nothing", () => {
        const body = [
            "The block to paste:",
            "",
            "```markdown",
            "- **Profile**: `project-profile.yaml`, which configures it.",
            "```",
            "",
            "and `rate_table` besides.",
        ].join("\n");
        expect(names(body)).toEqual([ "rate_table" ]);
    });

    test("the line is the one the name sits on", () => {
        const found = extractNames({
            body: "First.\n\nThen `rate_table`.\n",
            bodyStartLine: 6,
        });
        expect(found[0]?.line).toBe(8);
    });
});

describe("what is thrown out", () => {
    test("a command is not a name", () => {
        expect(names("Run `bun test` before claiming it.")).toEqual([]);
    });

    /**
     * The case that separates the whitespace rule from the identifier shape.
     * `rate(1 minute)` is a real EventBridge schedule, and the argument list
     * comes off call syntax before the shape is judged, so without the rule
     * the page is recorded as naming `rate`.
     */
    test("an expression carrying an argument is not one either", () => {
        expect(names("The schedule is `rate(1 minute)`.")).toEqual([]);
    });

    test("anything starting with a digit", () => {
        expect(names("`240ms` at p95, measured `2026-08-28`, tag `1.2.3`."))
            .toEqual([]);
    });

    test("a token too short to grep for", () => {
        expect(names("`id` and `ok` and `a`.")).toEqual([]);
    });

    test("a language literal", () => {
        expect(names("`true`, `false`, `null`, `undefined`.")).toEqual([]);
    });

    test("a token that is not shaped like an identifier or a path", () => {
        expect(names("`{ a: 1 }` and `<Foo />` and `#hash`.")).toEqual([]);
    });

    test("a name said twice is one name, at its first line", () => {
        const found = extractNames(page("`rate_table`\n\n`rate_table`"));
        expect(found).toEqual([
            { name: "rate_table", kind: "symbol", line: 1 },
        ]);
    });
});

/**
 * A page that names five hundred things is not five hundred times as worth
 * tracing, and the sweep has to stay bounded to stay runnable.
 */
test("the take is capped", () => {
    const body = Array.from(
        { length: MAX_NAMES_PER_PAGE + 20 },
        (_, i) => `\`symbol_${String(i).padStart(3, "0")}\``,
    ).join("\n\n");
    const found = extractNames(page(body));
    expect(found.length).toBe(MAX_NAMES_PER_PAGE);
    expect(found[0]?.name).toBe("symbol_000");
});

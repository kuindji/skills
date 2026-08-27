import { describe, expect, test } from "bun:test";
import { parseProfile } from "./parse";

/** Parse from a string, so cases stay readable inline. */
function parse(yaml: string) {
    return parseProfile(yaml, "/repo/project-profile.yaml");
}

const MINIMAL = `
tracker:
  backend: clickup
`;

describe("defaults", () => {
    test("a minimal profile is valid and fills its own defaults", () => {
        const result = parse(MINIMAL);
        expect(result.diagnostics).toEqual([]);
        expect(result.profile?.mode.default).toBe("greenfield");
        expect(result.profile?.taskflow.enabled).toBe(false);
        expect(result.profile?.owners).toEqual([]);
        expect(result.profile?.paths).toEqual([]);
    });

    test("docs thresholds default to 30 and 90 days", () => {
        const result = parse(`
tracker:
  backend: clickup
docs:
  root: docs
`);
        expect(result.diagnostics).toEqual([]);
        expect(result.profile?.docs?.staleAfterDays).toBe(30);
        expect(result.profile?.docs?.reviewAfterDays).toBe(90);
    });

    test("path_citations defaults to citation, the permissive policy", () => {
        const result = parse(`
tracker:
  backend: clickup
wiki:
  root: docs/wiki
`);
        expect(result.profile?.wiki?.pathCitations).toBe("citation");
    });
});

describe("tracker", () => {
    test("an unknown backend is rejected by name", () => {
        const result = parse(`
tracker:
  backend: jira
`);
        const d = result.diagnostics.find((d) => d.rule === "tracker.backend");
        expect(d).toBeDefined();
        expect(d?.severity).toBe("error");
        expect(d?.message).toContain("jira");
        expect(d?.remedy).toContain("in-repo");
    });

    test("an in-repo backend without a file is rejected", () => {
        const result = parse(`
tracker:
  backend: in-repo
`);
        const d = result.diagnostics.find((d) => d.rule === "tracker.file");
        expect(d).toBeDefined();
        expect(d?.remedy).toContain("tracker.file");
    });

    test("an in-repo backend with a file is accepted", () => {
        const result = parse(`
tracker:
  backend: in-repo
  file: docs/tasks.md
`);
        expect(result.diagnostics).toEqual([]);
        expect(result.profile?.tracker.file).toBe("docs/tasks.md");
    });
});

describe("owners", () => {
    const TWO_DEFAULTS = `
tracker:
  backend: in-repo
  file: docs/tasks.md
owners:
  main:
    paths: [packages/ui]
    default: true
  other:
    paths: [apps/thing]
    default: true
`;

    test("at most one owner may claim the default", () => {
        const d = parse(TWO_DEFAULTS).diagnostics.find(
            (d) => d.rule === "owners.default",
        );
        expect(d).toBeDefined();
        expect(d?.message).toContain("main");
        expect(d?.message).toContain("other");
    });

    test("two explicit owners claiming the same path is an error", () => {
        const result = parse(`
tracker:
  backend: clickup
owners:
  main:
    paths: [packages/ui, web]
  product:
    paths: [packages/ui]
`);
        const d = result.diagnostics.find((d) => d.rule === "owners.overlap");
        expect(d).toBeDefined();
        expect(d?.message).toContain("packages/ui");
    });

    test("the default owner does not count as an overlap", () => {
        const result = parse(`
tracker:
  backend: clickup
owners:
  main:
    paths: [packages/ui]
    default: true
  product:
    paths: [apps/thing]
`);
        expect(result.diagnostics).toEqual([]);
        expect(result.profile?.owners).toHaveLength(2);
        expect(
            result.profile?.owners.find((o) => o.name === "main")?.isDefault,
        ).toBe(true);
    });
});

describe("diagnostics", () => {
    test("a diagnostic points at the line the bad key is on", () => {
        const result = parse(`
tracker:
  backend: jira
`);
        // "backend: jira" is the third line of the template literal.
        expect(result.diagnostics[0]?.line).toBe(3);
    });

    test("an unknown top-level key is reported, not ignored", () => {
        const result = parse(`
tracker:
  backend: clickup
wikki:
  root: docs/wiki
`);
        const d = result.diagnostics.find((d) =>
            d.rule === "schema.unknownKey"
        );
        expect(d).toBeDefined();
        expect(d?.message).toContain("wikki");
    });

    test("malformed yaml is reported rather than thrown", () => {
        const result = parse("tracker:\n  backend: [unclosed\n");
        expect(result.profile).toBeUndefined();
        expect(result.diagnostics[0]?.rule).toBe("schema.parse");
    });
});

describe("wiki", () => {
    test("an invalid path_citations value names the two allowed policies", () => {
        const result = parse(`
tracker:
  backend: clickup
wiki:
  root: docs/wiki
  path_citations: off
`);
        const d = result.diagnostics.find(
            (d) => d.rule === "wiki.path_citations",
        );
        expect(d).toBeDefined();
        expect(d?.remedy).toContain("forbidden");
        expect(d?.remedy).toContain("citation");
    });
});

describe("root versus product profiles", () => {
    test("a product profile need not repeat the tracker backend", () => {
        const result = parseProfile(
            "product: p\npaths: [apps/p]\n",
            "/repo/docs/p/project-profile.yaml",
            { kind: "product" },
        );
        expect(result.diagnostics).toEqual([]);
        expect(result.profile?.product).toBe("p");
    });

    test("a product profile may name its tracker project", () => {
        const result = parseProfile(
            "product: p\npaths: [apps/p]\ntracker:\n  project: Board\n",
            "/repo/docs/p/project-profile.yaml",
            { kind: "product" },
        );
        expect(result.diagnostics).toEqual([]);
        expect(result.profile?.tracker.project).toBe("Board");
    });

    test("a product profile declaring a wiki is an error", () => {
        const result = parseProfile(
            "product: p\npaths: [apps/p]\nwiki:\n  root: docs/wiki\n",
            "/repo/docs/p/project-profile.yaml",
            { kind: "product" },
        );
        const d = result.diagnostics.find(
            (d) => d.rule === "schema.rootOnlyKey",
        );
        expect(d).toBeDefined();
        expect(d?.remedy).toContain("root project-profile.yaml");
    });

    test("a root profile still requires a tracker backend", () => {
        const result = parseProfile(
            "product: p\n",
            "/repo/project-profile.yaml",
        );
        expect(
            result.diagnostics.some((d) => d.rule === "tracker.backend"),
        ).toBe(true);
    });
});

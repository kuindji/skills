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

    test("todo-tray is a backend", () => {
        const result = parse(`
tracker:
  backend: todo-tray
  project: SKL
`);
        expect(result.diagnostics).toEqual([]);
        expect(result.profile?.tracker.backend).toBe("todo-tray");
    });

    test("taskflow is no longer a backend", () => {
        const result = parse(`
tracker:
  backend: taskflow
`);
        const d = result.diagnostics.find((d) => d.rule === "tracker.backend");
        expect(d).toBeDefined();
        expect(d?.message).toContain("taskflow");
        expect(d?.remedy).toContain("todo-tray");
    });

    /**
     * The case the whole schema change exists for. A repository that tracks
     * nothing declares no tracker, and absence is a configuration rather than
     * the half-written block below.
     */
    test("a profile declaring no tracker at all is valid", () => {
        const result = parse("mode:\n  default: greenfield\n");
        expect(result.diagnostics).toEqual([]);
        expect(result.profile?.tracker.backend).toBeUndefined();
    });

    test("an empty tracker mapping is a half-written declaration", () => {
        const result = parse("tracker: {}\n");
        const d = result.diagnostics.find((d) => d.rule === "tracker.backend");
        expect(d).toBeDefined();
        expect(d?.severity).toBe("error");
        expect(d?.remedy).toContain("remove the `tracker` block");
    });

    test("a tracker key with nothing under it is malformed", () => {
        const result = parse("tracker:\n");
        const d = result.diagnostics.find((d) => d.rule === "tracker.shape");
        expect(d).toBeDefined();
        expect(d?.severity).toBe("error");
    });

    test("a scalar tracker is malformed", () => {
        const result = parse("tracker: in-repo\n");
        expect(
            result.diagnostics.some((d) => d.rule === "tracker.shape"),
        ).toBe(true);
    });

    test("a product naming a board under a trackerless root is rejected", () => {
        const result = parseProfile(
            "product: p\npaths: [src]\ntracker:\n  project: SKL\n",
            "/repo/docs/p/project-profile.yaml",
            { kind: "product", rootDeclaresTracker: false },
        );
        const d = result.diagnostics.find(
            (d) => d.rule === "tracker.projectWithoutTracker",
        );
        expect(d).toBeDefined();
        expect(d?.severity).toBe("error");
    });

    test("a product may name a board where the root declares one", () => {
        const result = parseProfile(
            "product: p\npaths: [src]\ntracker:\n  project: SKL\n",
            "/repo/docs/p/project-profile.yaml",
            {
                kind: "product",
                rootDeclaresTracker: true,
                inherit: { trackerBackend: "todo-tray" },
            },
        );
        expect(
            result.diagnostics.some(
                (d) => d.rule === "tracker.projectWithoutTracker",
            ),
        ).toBe(false);
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

    // Ownership must partition the repo, and two patterns that claim the same
    // file overlap whether or not they are spelled the same way. Product paths
    // were already held to that standard; owners were compared as strings, so
    // the pair most likely to be written by hand went unreported.
    test("owner claims that collide without matching as strings are an error", () => {
        const result = parse(`
tracker:
  backend: clickup
owners:
  main:
    paths: [packages]
  product:
    paths: [packages/ui]
`);
        const d = result.diagnostics.find((d) => d.rule === "owners.overlap");
        expect(d).toBeDefined();
        expect(d?.message).toContain("packages/ui");
        expect(d?.message).toContain("main");
    });

    test("a glob owner claim colliding with a literal one is an error", () => {
        const result = parse(`
tracker:
  backend: clickup
owners:
  notes:
    paths: ["packages/notes-*"]
  domain:
    paths: [packages/notes-domain]
`);
        const d = result.diagnostics.find((d) => d.rule === "owners.overlap");
        expect(d).toBeDefined();
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

    // Every rule reading one of these compares it as a path prefix, and
    // `business/` prefixes nothing. Written with the slash it reads correctly
    // to a person and switches its rule off in silence.
    test("trailing slashes are stripped from directory settings", () => {
        const result = parse(`
tracker:
  backend: clickup
wiki:
  root: docs/wiki/
  business_subtree: business/
docs:
  root: docs//
`);
        expect(result.profile?.wiki?.root).toBe("docs/wiki");
        expect(result.profile?.wiki?.businessSubtree).toBe("business");
        expect(result.profile?.docs?.root).toBe("docs");
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

    /**
     * The reverse of what this rule used to say. A root profile naming no
     * tracker was an error until tracking became opt-in, which made a
     * repository that tracks nothing impossible to describe. What is still an
     * error is a `tracker` block that names no backend, which is tested above.
     */
    test("a root profile need not declare a tracker", () => {
        const result = parseProfile(
            "product: p\n",
            "/repo/project-profile.yaml",
        );
        expect(
            result.diagnostics.some((d) => d.rule === "tracker.backend"),
        ).toBe(false);
        expect(result.profile?.tracker.backend).toBeUndefined();
    });
});

/**
 * `docs.root` is repo-relative, and the spellings of the repository root
 * itself are the ones that used to prefix nothing at all.
 */
describe("the docs root", () => {
    test("`.` is the repository root", () => {
        const result = parseProfile(
            `tracker:\n  backend: linear\ndocs:\n  root: .\n`,
            "project-profile.yaml",
        );
        expect(result.diagnostics).toEqual([]);
        expect(result.profile?.docs?.root).toBe("");
    });

    test("a leading `./` is dropped", () => {
        const result = parseProfile(
            `tracker:\n  backend: linear\ndocs:\n  root: ./docs/\n`,
            "project-profile.yaml",
        );
        expect(result.profile?.docs?.root).toBe("docs");
    });

    /**
     * A product owns a subtree. One claiming the repository as its docs root
     * would demand a class from this product for every file in the repo,
     * including the other products' documents.
     */
    test("a product may not claim the repository root", () => {
        const result = parseProfile(
            `product: notes\npaths: [apps/notes]\ndocs:\n  root: .\n`,
            "docs/notes-app/project-profile.yaml",
            { kind: "product" },
        );
        const d = result.diagnostics.find((d) => d.rule === "docs.root");
        expect(d?.severity).toBe("error");
        expect(d?.remedy).toContain("docs/notes-app");
    });
});

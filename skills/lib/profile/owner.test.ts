import { describe, expect, test } from "bun:test";
import { writeIsAllowed } from "../guard/generated";
import { ownerForPath, resolveOwner } from "./owner";
import { parseProfile } from "./parse";
import type { Profile } from "./types";

function profileFrom(yaml: string): Profile {
    const result = parseProfile(yaml, "/repo/project-profile.yaml");
    if (!result.profile) {
        throw new Error(JSON.stringify(result.diagnostics));
    }
    return result.profile;
}

const MULTI_CLONE = profileFrom(`
tracker:
  backend: linear
owners:
  main:
    paths: [packages/ui, apps/ui-showcase, web, docs/wiki, scripts]
    shared: true
    default: true
  notes:
    paths: [apps/notes-app, "packages/notes-*", docs/notes-app]
  quiz-arcade:
    paths: [apps/quiz, apps/arcade, docs/quiz]
  portal:
    paths: [backend/portal, docs/portal]
`);

describe("ownerForPath", () => {
    test("an explicit owner claims its own subtree", () => {
        expect(
            ownerForPath(MULTI_CLONE, "apps/notes-app/src/app.tsx")
                ?.name,
        ).toBe("notes");
    });

    test("a glob in a path claims matching siblings", () => {
        expect(
            ownerForPath(MULTI_CLONE, "packages/notes-domain/src/index.ts")
                ?.name,
        ).toBe("notes");
    });

    test("the default owner claims what no explicit owner matched", () => {
        expect(ownerForPath(MULTI_CLONE, "package.json")?.name).toBe("main");
        expect(ownerForPath(MULTI_CLONE, "bun.lock")?.name).toBe("main");
    });

    test("an explicit claim beats the default owner's own listed paths", () => {
        // docs/wiki is listed under main, which is also the default.
        expect(ownerForPath(MULTI_CLONE, "docs/wiki/ui.md")?.name).toBe("main");
    });

    test("with no owners declared, every path is unowned", () => {
        const single = profileFrom("tracker:\n  backend: clickup\n");
        expect(ownerForPath(single, "src/anything.ts")).toBeUndefined();
    });
});

describe("writeIsAllowed", () => {
    test("a clone may write inside its own paths", () => {
        const verdict = writeIsAllowed(
            MULTI_CLONE,
            "notes",
            "apps/notes-app/src/app.tsx",
        );
        expect(verdict.allowed).toBe(true);
    });

    test("a product clone may not write a shared package", () => {
        const verdict = writeIsAllowed(
            MULTI_CLONE,
            "notes",
            "packages/ui/src/Button.tsx",
        );
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain("main");
        expect(verdict.reason).toContain("shared");
    });

    test("a product clone may not write another product's paths", () => {
        const verdict = writeIsAllowed(
            MULTI_CLONE,
            "notes",
            "apps/quiz/src/index.ts",
        );
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain("quiz-arcade");
    });

    test("the shared owner may write anywhere it owns", () => {
        expect(
            writeIsAllowed(MULTI_CLONE, "main", "packages/ui/src/Button.tsx")
                .allowed,
        ).toBe(true);
        expect(writeIsAllowed(MULTI_CLONE, "main", "bun.lock").allowed).toBe(
            true,
        );
    });

    test("an unknown owner name is refused rather than assumed", () => {
        const verdict = writeIsAllowed(MULTI_CLONE, "typo", "package.json");
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain("typo");
    });

    test("with no owners declared, writes are unrestricted", () => {
        const single = profileFrom("tracker:\n  backend: clickup\n");
        expect(writeIsAllowed(single, undefined, "anything.ts").allowed).toBe(
            true,
        );
    });
});

/**
 * The default owner claims two very different populations under one name: the
 * paths it listed for itself, and everything nobody claimed at all. Measured
 * across 701 commits of the repository this fixture is drawn from, 115 span
 * two owners; 79 of those reach the default owner through a path it explicitly
 * listed, and 36 reach it only through the complement, topped by `bun.lock`
 * and the root `package.json` — the two files that repo's own rules expressly
 * permit any clone to commit. Refusing both alike would refuse every routine
 * dependency install, so the guard has to be able to tell them apart.
 */
describe("how an owner matched", () => {
    test("a listed path of an explicit owner matches explicitly", () => {
        const match = resolveOwner(MULTI_CLONE, "apps/quiz/src/a.tsx");
        expect(match?.owner.name).toBe("quiz-arcade");
        expect(match?.via).toBe("explicit");
    });

    test("a listed path of the default owner matches explicitly", () => {
        const match = resolveOwner(MULTI_CLONE, "packages/ui/src/Button.tsx");
        expect(match?.owner.name).toBe("main");
        expect(match?.via).toBe("explicit");
    });

    test("a path nobody listed reaches the default owner by complement", () => {
        const match = resolveOwner(MULTI_CLONE, "bun.lock");
        expect(match?.owner.name).toBe("main");
        expect(match?.via).toBe("default");
    });

    test("a repo with no owners resolves to nothing", () => {
        const solo = profileFrom(
            "tracker:\n  backend: in-repo\n  file: t.md\n",
        );
        expect(resolveOwner(solo, "a.ts")).toBeUndefined();
    });

    test("with no default owner, an unclaimed path resolves to nothing", () => {
        const partial = profileFrom(`
tracker:
  backend: linear
owners:
  a:
    paths: [apps/a]
  b:
    paths: [apps/b]
`);
        expect(resolveOwner(partial, "apps/a/x.ts")?.via).toBe("explicit");
        expect(resolveOwner(partial, "README.md")).toBeUndefined();
    });
});

/**
 * Overlapping owner paths are a schema error, but the profile still parses and
 * the guard still has to answer. Two resolvers disagreeing about who owns a
 * path would mean the refusal message names a different owner from the one the
 * rule consulted, which is worse than either answer alone.
 */
describe("resolveOwner and ownerForPath agree", () => {
    const OVERLAPPING = profileFrom(`
tracker:
  backend: linear
owners:
  main:
    paths: [docs]
    shared: true
    default: true
  notes:
    paths: [docs/notes-app]
`);

    test("an explicit owner wins even when the default is declared first", () => {
        const path = "docs/notes-app/plan.md";
        expect(ownerForPath(OVERLAPPING, path)?.name).toBe("notes");
        expect(resolveOwner(OVERLAPPING, path)?.owner.name).toBe("notes");
    });
});

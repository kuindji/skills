import { describe, expect, test } from "bun:test";
import { ownerForPath, writeIsAllowed } from "./owner";
import { parseProfile } from "./parse";
import type { Profile } from "./types";

function profileFrom(yaml: string): Profile {
    const result = parseProfile(yaml, "/repo/project-profile.yaml");
    if (!result.profile) {
        throw new Error(JSON.stringify(result.diagnostics));
    }
    return result.profile;
}

const BEARINGKIND = profileFrom(`
tracker:
  backend: linear
owners:
  main:
    paths: [packages/ui, apps/ui-showcase, web, docs/wiki, scripts]
    shared: true
    default: true
  baby-sleep:
    paths: [apps/baby-sleep-tracker, "packages/sleep-*", docs/baby-sleep-tracker]
  detector-game:
    paths: [apps/detector, apps/game, docs/detector]
  relocant:
    paths: [backend/relocant, docs/relocant]
`);

describe("ownerForPath", () => {
    test("an explicit owner claims its own subtree", () => {
        expect(
            ownerForPath(BEARINGKIND, "apps/baby-sleep-tracker/src/app.tsx")
                ?.name,
        ).toBe("baby-sleep");
    });

    test("a glob in a path claims matching siblings", () => {
        expect(
            ownerForPath(BEARINGKIND, "packages/sleep-domain/src/index.ts")
                ?.name,
        ).toBe("baby-sleep");
    });

    test("the default owner claims what no explicit owner matched", () => {
        expect(ownerForPath(BEARINGKIND, "package.json")?.name).toBe("main");
        expect(ownerForPath(BEARINGKIND, "bun.lock")?.name).toBe("main");
    });

    test("an explicit claim beats the default owner's own listed paths", () => {
        // docs/wiki is listed under main, which is also the default.
        expect(ownerForPath(BEARINGKIND, "docs/wiki/ui.md")?.name).toBe("main");
    });

    test("with no owners declared, every path is unowned", () => {
        const single = profileFrom("tracker:\n  backend: clickup\n");
        expect(ownerForPath(single, "src/anything.ts")).toBeUndefined();
    });
});

describe("writeIsAllowed", () => {
    test("a clone may write inside its own paths", () => {
        const verdict = writeIsAllowed(
            BEARINGKIND,
            "baby-sleep",
            "apps/baby-sleep-tracker/src/app.tsx",
        );
        expect(verdict.allowed).toBe(true);
    });

    test("a product clone may not write a shared package", () => {
        const verdict = writeIsAllowed(
            BEARINGKIND,
            "baby-sleep",
            "packages/ui/src/Button.tsx",
        );
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain("main");
        expect(verdict.reason).toContain("shared");
    });

    test("a product clone may not write another product's paths", () => {
        const verdict = writeIsAllowed(
            BEARINGKIND,
            "baby-sleep",
            "apps/detector/src/index.ts",
        );
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain("detector-game");
    });

    test("the shared owner may write anywhere it owns", () => {
        expect(
            writeIsAllowed(BEARINGKIND, "main", "packages/ui/src/Button.tsx")
                .allowed,
        ).toBe(true);
        expect(writeIsAllowed(BEARINGKIND, "main", "bun.lock").allowed).toBe(
            true,
        );
    });

    test("an unknown owner name is refused rather than assumed", () => {
        const verdict = writeIsAllowed(BEARINGKIND, "typo", "package.json");
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

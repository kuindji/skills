import { describe, expect, test } from "bun:test";
import { buildProductIndex, modeForPath, productForPath } from "./index";
import { parseProfile } from "./parse";
import type { Profile } from "./types";

function profileFrom(
    yaml: string,
    path: string,
    kind: "root" | "product" = "product",
): Profile {
    const result = parseProfile(yaml, path, { kind });
    if (!result.profile) {
        throw new Error(JSON.stringify(result.diagnostics));
    }
    return result.profile;
}

const ROOT = profileFrom(
    `
tracker:
  backend: linear
wiki:
  root: docs/wiki
`,
    "/repo/project-profile.yaml",
    "root",
);

const NOTES = profileFrom(
    `
product: notes-app
paths: [apps/notes-app, "packages/notes-*"]
roadmap: ./milestones.md
mode:
  default: greenfield
  overrides:
    packages/notes-domain: mature
`,
    "/repo/docs/notes-app/project-profile.yaml",
);

const QUIZ = profileFrom(
    `
product: quiz
paths: [apps/quiz, apps/arcade]
mode:
  default: greenfield
`,
    "/repo/docs/quiz/project-profile.yaml",
);

describe("productForPath", () => {
    const index = buildProductIndex(ROOT, [ NOTES, QUIZ ]);

    test("a path inside a product's claim resolves to that product", () => {
        expect(
            productForPath(index, "apps/notes-app/src/app.tsx")
                ?.product,
        ).toBe("notes-app");
    });

    test("a globbed claim resolves too", () => {
        expect(
            productForPath(index, "packages/notes-domain/src/index.ts")
                ?.product,
        ).toBe("notes-app");
    });

    test("an unclaimed path falls back to the root profile", () => {
        const resolved = productForPath(index, "packages/ui/src/Button.tsx");
        expect(resolved?.product).toBeUndefined();
        expect(resolved?.sourcePath).toBe("/repo/project-profile.yaml");
    });

    test("the index reports no overlap for disjoint products", () => {
        expect(index.diagnostics).toEqual([]);
    });
});

describe("overlap", () => {
    test("two products claiming the same path is an error naming both", () => {
        const rival = profileFrom(
            `
product: rival
paths: [apps/notes-app]
`,
            "/repo/docs/rival/project-profile.yaml",
        );
        const index = buildProductIndex(ROOT, [ NOTES, rival ]);
        const d = index.diagnostics.find((d) => d.rule === "products.overlap");
        expect(d).toBeDefined();
        expect(d?.message).toContain("notes-app");
        expect(d?.message).toContain("rival");
    });

    test("two products may not share a name", () => {
        const twin = profileFrom(
            `
product: notes-app
paths: [apps/other]
`,
            "/repo/docs/other/project-profile.yaml",
        );
        const index = buildProductIndex(ROOT, [ NOTES, twin ]);
        expect(
            index.diagnostics.some((d) => d.rule === "products.duplicateName"),
        ).toBe(true);
    });

    test("a product profile that declares no paths is an error", () => {
        const pathless = profileFrom(
            "product: ghost\n",
            "/repo/docs/ghost/project-profile.yaml",
        );
        const index = buildProductIndex(ROOT, [ pathless ]);
        const d = index.diagnostics.find((d) => d.rule === "products.noPaths");
        expect(d).toBeDefined();
        expect(d?.remedy).toContain("paths");
    });
});

describe("modeForPath", () => {
    const index = buildProductIndex(ROOT, [ NOTES, QUIZ ]);

    test("uses the product's default where no override applies", () => {
        expect(modeForPath(index, "apps/notes-app/src/app.tsx")).toBe(
            "greenfield",
        );
    });

    test("an override wins for its subtree", () => {
        expect(modeForPath(index, "packages/notes-domain/src/rules.ts")).toBe(
            "mature",
        );
    });

    test("the longest matching override wins", () => {
        const nested = profileFrom(
            `
product: p
paths: [src]
mode:
  default: greenfield
  overrides:
    src/core: mature
    src/core/legacy: greenfield
`,
            "/repo/docs/p/project-profile.yaml",
        );
        const i = buildProductIndex(ROOT, [ nested ]);
        expect(modeForPath(i, "src/core/thing.ts")).toBe("mature");
        expect(modeForPath(i, "src/core/legacy/old.ts")).toBe("greenfield");
    });

    test("an unclaimed path takes the root profile's mode", () => {
        expect(modeForPath(index, "packages/ui/src/Button.tsx")).toBe(
            "greenfield",
        );
    });
});

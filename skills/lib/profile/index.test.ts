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

const BABY = profileFrom(
    `
product: baby-sleep-tracker
paths: [apps/baby-sleep-tracker, "packages/sleep-*"]
roadmap: ./milestones.md
mode:
  default: greenfield
  overrides:
    packages/sleep-domain: mature
`,
    "/repo/docs/baby-sleep-tracker/project-profile.yaml",
);

const DETECTOR = profileFrom(
    `
product: detector
paths: [apps/detector, apps/game]
mode:
  default: greenfield
`,
    "/repo/docs/detector/project-profile.yaml",
);

describe("productForPath", () => {
    const index = buildProductIndex(ROOT, [ BABY, DETECTOR ]);

    test("a path inside a product's claim resolves to that product", () => {
        expect(
            productForPath(index, "apps/baby-sleep-tracker/src/app.tsx")
                ?.product,
        ).toBe("baby-sleep-tracker");
    });

    test("a globbed claim resolves too", () => {
        expect(
            productForPath(index, "packages/sleep-domain/src/index.ts")
                ?.product,
        ).toBe("baby-sleep-tracker");
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
paths: [apps/baby-sleep-tracker]
`,
            "/repo/docs/rival/project-profile.yaml",
        );
        const index = buildProductIndex(ROOT, [ BABY, rival ]);
        const d = index.diagnostics.find((d) => d.rule === "products.overlap");
        expect(d).toBeDefined();
        expect(d?.message).toContain("baby-sleep-tracker");
        expect(d?.message).toContain("rival");
    });

    test("two products may not share a name", () => {
        const twin = profileFrom(
            `
product: baby-sleep-tracker
paths: [apps/other]
`,
            "/repo/docs/other/project-profile.yaml",
        );
        const index = buildProductIndex(ROOT, [ BABY, twin ]);
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
    const index = buildProductIndex(ROOT, [ BABY, DETECTOR ]);

    test("uses the product's default where no override applies", () => {
        expect(modeForPath(index, "apps/baby-sleep-tracker/src/app.tsx")).toBe(
            "greenfield",
        );
    });

    test("an override wins for its subtree", () => {
        expect(modeForPath(index, "packages/sleep-domain/src/rules.ts")).toBe(
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

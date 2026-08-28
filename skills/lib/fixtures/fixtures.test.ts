import { describe, expect, test } from "bun:test";
import { writeIsAllowed } from "../guard/generated";
import {
    buildProductIndex,
    modeForPath,
    productForPath,
} from "../profile/index";
import { ownerForPath } from "../profile/owner";
import { parseProfile } from "../profile/parse";
import type { Profile } from "../profile/types";

const here = new URL(".", import.meta.url).pathname;

async function load(
    relative: string,
    kind: "root" | "product",
): Promise<Profile> {
    const file = `${here}${relative}`;
    const result = parseProfile(await Bun.file(file).text(), file, { kind });
    if (!result.profile) {
        throw new Error(
            `${relative} did not parse: ${JSON.stringify(result.diagnostics)}`,
        );
    }
    expect(result.diagnostics).toEqual([]);
    return result.profile;
}

describe("BearingKind: four products, clone ownership", () => {
    async function index() {
        const root = await load("bearingkind/project-profile.yaml", "root");
        const products = [
            await load(
                "bearingkind/docs/baby-sleep-tracker/project-profile.yaml",
                "product",
            ),
            await load(
                "bearingkind/docs/detector/project-profile.yaml",
                "product",
            ),
        ];
        return { root, i: buildProductIndex(root, products) };
    }

    test("the whole shape parses and the products do not overlap", async () => {
        const { i } = await index();
        expect(i.diagnostics).toEqual([]);
    });

    test("a shared package belongs to the default owner, not a product", async () => {
        const { root, i } = await index();
        expect(ownerForPath(root, "packages/ui/src/Button.tsx")?.name).toBe(
            "main",
        );
        // Owned by main, but claimed by no product: the root profile governs.
        expect(
            productForPath(i, "packages/ui/src/Button.tsx")?.product,
        ).toBeUndefined();
    });

    /**
     * The real ownership table names three packages that share no prefix, and
     * a brace list is the only way to claim them in one pattern. Left out of
     * the fixture, they fell to the default owner by complement, and a
     * detector-game commit touching `packages/analysis` was reported as
     * writing somewhere nobody claimed.
     */
    test("a brace list claims packages that share no prefix", async () => {
        const { root } = await index();
        for (const pkg of [ "taxonomy", "analysis", "persistence" ]) {
            expect(ownerForPath(root, `packages/${pkg}/src/index.ts`)?.name)
                .toBe("detector-game");
        }
    });

    test("a product clone is refused a write to a shared package", async () => {
        const { root } = await index();
        const verdict = writeIsAllowed(
            root,
            "baby-sleep",
            "packages/ui/src/Button.tsx",
        );
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain("main");
    });

    test("root config falls to the default owner", async () => {
        const { root } = await index();
        expect(ownerForPath(root, "bun.lock")?.name).toBe("main");
        expect(ownerForPath(root, "package.json")?.name).toBe("main");
    });

    test("a mature package inside a greenfield product keeps mature", async () => {
        const { i } = await index();
        expect(modeForPath(i, "apps/baby-sleep-tracker/src/app.tsx")).toBe(
            "greenfield",
        );
        expect(modeForPath(i, "packages/sleep-domain/src/rules.ts")).toBe(
            "mature",
        );
    });

    test("each product carries its own docs root and roadmap", async () => {
        const { i } = await index();
        const baby = productForPath(i, "apps/baby-sleep-tracker/src/app.tsx");
        expect(baby?.roadmap).toBe("docs/baby-sleep-tracker/milestones.md");
        expect(baby?.docs?.root).toBe("docs/baby-sleep-tracker");

        const detector = productForPath(i, "apps/detector/src/index.ts");
        expect(detector?.roadmap).toBeUndefined();
    });
});

describe("TheFloorr: mature, dual wiki profiles, no roadmap", () => {
    test("parses, and declares no roadmap", async () => {
        const profile = await load("thefloorr/project-profile.yaml", "root");
        expect(profile.roadmap).toBeUndefined();
        expect(profile.mode.default).toBe("mature");
    });

    test("carries both wiki profiles and a self-contained business subtree", async () => {
        const profile = await load("thefloorr/project-profile.yaml", "root");
        expect(profile.wiki?.profiles).toEqual([ "business", "technical" ]);
        expect(profile.wiki?.businessSubtree).toBe("business");
    });

    test("allows path citations, unlike this repo", async () => {
        const profile = await load("thefloorr/project-profile.yaml", "root");
        expect(profile.wiki?.pathCitations).toBe("citation");
    });

    test("declares no owners, so writes are unrestricted", async () => {
        const profile = await load("thefloorr/project-profile.yaml", "root");
        expect(profile.owners).toEqual([]);
        expect(
            writeIsAllowed(
                profile,
                undefined,
                "serverless/api/click/src/index.ts",
            )
                .allowed,
        ).toBe(true);
    });
});

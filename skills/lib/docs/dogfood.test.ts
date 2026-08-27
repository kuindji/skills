import { describe, expect, test } from "bun:test";
import { parseProfile } from "../profile/parse";
import { scanDocs, validateDocs } from "./scan";

/**
 * Classification has to hold against this repo before it is pointed at anyone
 * else's. The first run of this check found docs/house-rules.md unclassified,
 * which is the rule doing its job.
 */
describe("this repo's docs classify cleanly", () => {
    const root = new URL("../../../", import.meta.url).pathname;

    async function scan() {
        const file = `${root}project-profile.yaml`;
        const source = await Bun.file(file).text();
        const { profile } = parseProfile(source, file);
        if (!profile) {
            throw new Error("this repo's own profile does not parse");
        }
        return scanDocs(profile, root);
    }

    test("every file under docs/ matches exactly one class", async () => {
        const result = await scan();
        const errors = result.diagnostics.filter(
            (d) => d.severity === "error",
        );
        expect(errors).toEqual([]);
    });

    test("no declared glob is dead", async () => {
        const result = await scan();
        const dead = result.diagnostics.filter(
            (d) => d.rule === "docs.deadGlob",
        );
        expect(dead).toEqual([]);
    });

    test("the repo-root README is classified live", async () => {
        const { files } = await scan();
        const byPath = new Map(files.map((f) => [ f.path, f.docClass ]));
        expect(byPath.get("README.md")).toBe("live");
    });

    test("the spec is lifecycle and the tracker is tracker", async () => {
        const { files } = await scan();
        const byPath = new Map(files.map((f) => [ f.path, f.docClass ]));
        expect(byPath.get("docs/tasks.md")).toBe("tracker");
        expect(
            byPath.get(
                "docs/specs/2026-08-27-project-management-skills-design.md",
            ),
        ).toBe("lifecycle");
    });

    test("this repo's own spec passes the lifecycle rules", async () => {
        const file = `${root}project-profile.yaml`;
        const { profile } = parseProfile(await Bun.file(file).text(), file);
        const result = await validateDocs(profile!, root);
        expect(result.lifecycle.map((doc) => doc.path)).toEqual([
            "docs/specs/2026-08-27-project-management-skills-design.md",
        ]);
        expect(result.diagnostics).toEqual([]);
    });

    test("wiki pages are not given doc classes", async () => {
        const { files } = await scan();
        expect(files.some((f) => f.path.startsWith("docs/wiki/"))).toBe(false);
    });
});

import { describe, expect, test } from "bun:test";
import { parseProfile } from "./parse";

/**
 * This repo is its own first subject. If the parser cannot read the profile
 * that configures the repo it lives in, nothing downstream is trustworthy.
 */
describe("this repo's own profile", () => {
    const file = new URL("../../../project-profile.yaml", import.meta.url)
        .pathname;

    test("parses with no diagnostics", async () => {
        const source = await Bun.file(file).text();
        const result = parseProfile(source, file);
        expect(result.diagnostics).toEqual([]);
        expect(result.profile).toBeDefined();
    });

    test("declares an in-repo tracker pointing at a file that exists", async () => {
        const source = await Bun.file(file).text();
        const { profile } = parseProfile(source, file);
        expect(profile?.tracker.backend).toBe("in-repo");
        expect(profile?.tracker.file).toBe("docs/tasks.md");

        const tracker = new URL(
            `../../../${profile?.tracker.file}`,
            import.meta.url,
        ).pathname;
        expect(await Bun.file(tracker).exists()).toBe(true);
    });

    test("forbids path citations, as a repo about the rule should", async () => {
        const source = await Bun.file(file).text();
        const { profile } = parseProfile(source, file);
        expect(profile?.wiki?.pathCitations).toBe("forbidden");
    });

    test("declares a wiki root that exists, even though it is empty", async () => {
        const source = await Bun.file(file).text();
        const { profile } = parseProfile(source, file);
        const root = new URL(
            `../../../${profile?.wiki?.root}`,
            import.meta.url,
        ).pathname;
        expect(await Bun.file(`${root}/.gitkeep`).exists()).toBe(true);
    });
});

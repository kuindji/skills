import { describe, expect, test } from "bun:test";
import { loadWikiPages } from "../wiki/scan";
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

    // This asked for the `.gitkeep` that was how an empty wiki root stayed in
    // the repository at all. The root holds pages now, so the check is the one
    // it always meant: a declared root resolving to nothing is the shape a
    // repository teaching this system by example must not be in.
    test("declares a wiki root that exists and holds pages", async () => {
        const source = await Bun.file(file).text();
        const { profile } = parseProfile(source, file);
        const repoRoot = new URL("../../../", import.meta.url).pathname;
        const pages = await loadWikiPages(profile!, repoRoot);
        expect(pages.length).toBeGreaterThan(0);
        expect(pages.map((page) => page.slug)).toContain("README");
    });
});

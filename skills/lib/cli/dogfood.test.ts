import { describe, expect, test } from "bun:test";
import { run as projectValidate } from "./project-validate";
import { EXIT } from "./report";

/**
 * This repo is the acceptance corpus. `project-validate` exiting 0 here is the
 * gate the whole build is measured against, so it is asserted as a test rather
 * than as something someone remembers to run.
 */

const repoRoot = new URL("../../../", import.meta.url).pathname.replace(
    /\/$/,
    "",
);

function sink() {
    const lines: string[] = [];
    return {
        io: {
            out: (line: string) => lines.push(line),
            err: (line: string) => lines.push(line),
        },
        text: () => lines.join("\n"),
    };
}

describe("project-validate against this repo", () => {
    test("exits 0", async () => {
        const out = sink();
        const code = await projectValidate([ "--repo", repoRoot ], out.io);
        if (code !== EXIT.ok) {
            // The output is the finding, so it goes into the failure message
            // rather than being reported as a bare exit code.
            throw new Error(`project-validate failed:\n${out.text()}`);
        }
        expect(code).toBe(EXIT.ok);
    });

    test("reports no errors of any kind", async () => {
        const out = sink();
        await projectValidate([ "--repo", repoRoot, "--json" ], out.io);
        const parsed = JSON.parse(out.text());
        expect(parsed.errors).toBe(0);
        expect(
            parsed.diagnostics.filter(
                (d: { severity: string; }) => d.severity === "error",
            ),
        ).toEqual([]);
    });

    /**
     * The fixture repositories under `skills/lib/fixtures/` are other repos'
     * profiles. Reading them as this repo's products is the failure the
     * boundary rule exists to prevent, and a silent skip is only trustworthy
     * if the run says what it skipped.
     */
    test("says which nested repositories it did not read", async () => {
        const out = sink();
        await projectValidate([ "--repo", repoRoot ], out.io);
        expect(out.text()).toContain("2 nested repositories skipped");
        expect(out.text()).toContain("skills/lib/fixtures/multi-product");
    });
});

describe("the bins are wired up", () => {
    const names = [
        "project-validate",
        "profile-validate",
        "wiki-validate",
        "wiki-drift",
        "docs-validate",
        "docs-freeze",
        "guard-generated",
    ];

    test("package.json declares every bin, and each file exists", async () => {
        const manifest = await Bun.file(`${repoRoot}/package.json`).json();
        expect(Object.keys(manifest.bin).sort()).toEqual([ ...names ].sort());
        for (const name of names) {
            const path = `${repoRoot}/skills/bin/${name}.ts`;
            expect(manifest.bin[name]).toBe(`./skills/bin/${name}.ts`);
            expect(await Bun.file(path).exists()).toBe(true);
        }
    });

    /**
     * The one test that spawns a process. Everything else drives `run`
     * directly, which would keep passing if the entry point itself were
     * broken: a missing shebang, a bad import path, or an exit code that never
     * reaches the shell.
     */
    test("a bin run as a program reports through its exit code", async () => {
        const proc = Bun.spawn([
            `${repoRoot}/skills/bin/project-validate.ts`,
            "--repo",
            repoRoot,
            "--json",
        ], { stdout: "pipe", stderr: "pipe" });
        const [ stdout, code ] = await Promise.all([
            new Response(proc.stdout).text(),
            proc.exited,
        ]);
        expect(code).toBe(EXIT.ok);
        expect(JSON.parse(stdout).tool).toBe("project-validate");
    });

    test("a bin run against a directory with no profile exits 2", async () => {
        const proc = Bun.spawn([
            `${repoRoot}/skills/bin/project-validate.ts`,
            "--repo",
            "/tmp",
        ], { stdout: "pipe", stderr: "pipe" });
        expect(await proc.exited).toBe(EXIT.unusable);
    });
});

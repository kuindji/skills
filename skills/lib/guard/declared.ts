import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { claims } from "../profile/paths";
import type { Diagnostic, Profile } from "../profile/types";

/**
 * Whether the patterns a profile declares still match anything.
 *
 * A `generated_paths` entry that matches nothing is worse than absent: it
 * reads, in review, as protection that is not there. The pattern usually died
 * quietly — a directory was renamed, a tool changed where it writes — and
 * nothing about the profile shows it.
 *
 * The check has to look at the working tree, not the index, and that is the
 * whole difficulty. Generated trees are gitignored precisely because they are
 * generated: in a real Expo monorepo, all four declared patterns match zero
 * tracked files across 701 commits while more than five thousand matching
 * files sit on disk. Judged by git alone, every one of them would be called
 * dead, and the advice would be to delete the only rules protecting those
 * trees.
 */

/** Directories never worth walking: not the project's output, and enormous. */
const SKIPPED_DIRECTORIES = new Set([ "node_modules", ".git" ]);

export async function validateGeneratedPaths(
    repoRoot: string,
    profile: Profile,
): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    for (const [ index, pattern ] of profile.generatedPaths.entries()) {
        if (await matchesSomething(repoRoot, pattern)) {
            continue;
        }
        diagnostics.push({
            file: profile.sourcePath,
            keyPath: `generated_paths[${index}]`,
            rule: "guard.deadGeneratedPath",
            message:
                `\`${pattern}\` matches no file in this repository, tracked or `
                + "ignored, so it guards nothing.",
            remedy: "Correct the pattern to where the generator writes now, or "
                + "remove it. A pattern left in place reads as protection that "
                + "is not there. If the generator has simply never run in this "
                + "clone, running it once settles the question.",
            severity: "warning",
        });
    }

    return diagnostics;
}

/**
 * Whether any file under the repo matches, stopping at the first one.
 *
 * A directory walk rather than a glob scan of the whole tree, because the cost
 * is dominated by dependencies: scanning a real monorepo for one of its own
 * declared patterns took 1.5 seconds through `node_modules` and under 200ms
 * without it. Proving a pattern dead still costs a full walk, which is
 * inherent — absence cannot be shown by looking in one place.
 */
async function matchesSomething(
    repoRoot: string,
    pattern: string,
): Promise<boolean> {
    const pending = [ "" ];
    while (pending.length > 0) {
        const directory = pending.pop()!;
        let entries;
        try {
            entries = await readdir(join(repoRoot, directory), {
                withFileTypes: true,
            });
        }
        catch {
            // A directory that vanished or cannot be read says nothing about
            // the pattern; the rest of the tree still answers the question.
            continue;
        }
        for (const entry of entries) {
            if (SKIPPED_DIRECTORIES.has(entry.name)) {
                continue;
            }
            const path = directory === ""
                ? entry.name
                : `${directory}/${entry.name}`;
            // Symlinks are not followed, so a link into another tree cannot
            // make a pattern look alive on the strength of a file this repo
            // does not contain, and a cycle cannot hang the walk. `readdir`
            // already reports a link to a directory as not-a-directory; the
            // second test states that rather than relying on it.
            if (entry.isDirectory() && !entry.isSymbolicLink()) {
                pending.push(path);
                continue;
            }
            if (claims(pattern, path)) {
                return true;
            }
        }
    }
    return false;
}

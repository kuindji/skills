import type { Profile } from "../profile/types";
import { classifyDocPaths, type ClassifyResult } from "./classify";

/**
 * List the repo's files as git sees them.
 *
 * Tracked files plus untracked ones that are not ignored. A raw directory walk
 * would classify node_modules and build output; asking git means the validator
 * sees exactly what a reviewer would.
 */
export async function listRepoFiles(repoRoot: string): Promise<string[]> {
    const proc = Bun.spawn(
        [ "git", "ls-files", "--cached", "--others", "--exclude-standard" ],
        { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
    );
    const [ stdout, exitCode ] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
    ]);
    if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(
            `git ls-files failed in ${repoRoot}: ${stderr.trim()}`,
        );
    }
    return stdout.split("\n").filter((line) => line.length > 0);
}

/** Classify every doc in a repo on disk. */
export async function scanDocs(
    profile: Profile,
    repoRoot: string,
): Promise<ClassifyResult> {
    const paths = await listRepoFiles(repoRoot);
    return classifyDocPaths(profile, paths);
}

import { basename, dirname, join } from "node:path";

/**
 * Which owner is the working copy we are standing in.
 *
 * Git cannot answer this. Several clones of one repository sit side by side,
 * each scoped to a different product, and they all share one origin URL, so
 * the remote carries no owner signal at all.
 *
 * Resolution, in order:
 *   1. `.agent-owner` at the clone root. Explicit, and the only reliable
 *      answer when a clone is not named after its owner.
 *   2. The directory name of the clone's main working tree. This is the
 *      convention repos already follow, and going through the common git
 *      directory means a worktree resolves to the clone it was created from
 *      rather than to its own throwaway directory name.
 */
export async function resolveCurrentOwner(
    startDir: string,
): Promise<string | undefined> {
    const mainWorkTree = await mainWorkTreeOf(startDir);
    if (mainWorkTree === undefined) {
        return undefined;
    }

    const marker = Bun.file(join(mainWorkTree, ".agent-owner"));
    if (await marker.exists()) {
        const declared = (await marker.text()).trim();
        if (declared.length > 0) {
            return declared;
        }
    }

    return basename(mainWorkTree);
}

/**
 * The main working tree for the repository containing `startDir`.
 *
 * `--git-common-dir` points at the shared git directory, which for a linked
 * worktree is the main clone's `.git`. Its parent is the main working tree.
 */
export async function mainWorkTreeOf(
    startDir: string,
): Promise<string | undefined> {
    const proc = Bun.spawn(
        [ "git", "rev-parse", "--path-format=absolute", "--git-common-dir" ],
        { cwd: startDir, stdout: "pipe", stderr: "ignore" },
    );
    const [ stdout, exitCode ] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
    ]);
    if (exitCode !== 0) {
        return undefined;
    }
    const gitDir = stdout.trim();
    if (gitDir.length === 0) {
        return undefined;
    }
    // A bare repository has no working tree to name.
    return gitDir.endsWith("/.git") ? dirname(gitDir) : undefined;
}

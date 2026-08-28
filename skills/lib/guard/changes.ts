/**
 * Which paths a change touches.
 *
 * The guard's rules are about paths, and this is the only place that decides
 * what "the change" means. Three properties matter, and each one exists
 * because losing it makes the guard quietly wrong rather than noisy:
 *
 *   - Both sides of a rename. `--name-only` reports the destination, so a
 *     generated file renamed out of its guarded directory would be checked
 *     under its new, unguarded name and pass.
 *   - Deletions. Removing a generated file is still touching it.
 *   - Files not yet staged, including brand-new ones. Writing a file is the
 *     first thing an agent does and the last thing `git diff` notices.
 *
 * What it deliberately cannot see is a gitignored file, because git will not
 * report one at any cost. That is not a gap to work around here: the generated
 * trees most worth guarding are ignored precisely because they are generated,
 * so the guard also takes paths directly from the caller rather than only from
 * a diff.
 */

export interface ChangeOptions {
    /**
     * Compare against this ref instead of HEAD. The comparison is against the
     * merge base, so the answer is what this branch changed rather than
     * everything that has happened on the base since it was cut.
     */
    base?: string;
}

/** Every repo-relative path a change touches, sorted, without duplicates. */
export async function changedPaths(
    repoRoot: string,
    options: ChangeOptions = {},
): Promise<string[]> {
    const touched = new Set<string>();

    const from = options.base === undefined
        ? undefined
        : await mergeBase(repoRoot, options.base);

    if (from !== undefined) {
        for (const path of await diffNameStatus(repoRoot, [ from ])) {
            touched.add(path);
        }
    }

    // Committed work is only half of it: a guard that ran before the commit
    // would be looking at nothing at all.
    if (await hasCommits(repoRoot)) {
        for (const path of await diffNameStatus(repoRoot, [ "HEAD" ])) {
            touched.add(path);
        }
    }
    else {
        // Before the first commit there is no HEAD to diff against, and
        // staging a file also takes it off the untracked list. Without this
        // the two passes miss it between them and the change looks empty.
        for (const path of await listFiles(repoRoot, [ "--cached" ])) {
            touched.add(path);
        }
    }
    for (const path of await untrackedFiles(repoRoot)) {
        touched.add(path);
    }

    return [ ...touched ].sort();
}

/**
 * Paths named by a `git diff --name-status` run.
 *
 * `-z` for the same reason everything else here uses it: git octal-escapes any
 * path outside ASCII by default, and the escaped form matches no declared
 * pattern, so the file passes every rule silently.
 *
 * `-M` asks for rename detection explicitly so that a rename arrives as one
 * record naming both paths rather than as an unrelated add and delete. Either
 * form yields both paths here; asking makes the parsing deterministic instead
 * of dependent on the repository's diff configuration.
 */
async function diffNameStatus(
    repoRoot: string,
    revisions: string[],
): Promise<string[]> {
    const proc = Bun.spawn(
        [
            "git",
            "-c",
            "core.quotePath=false",
            "diff",
            "--name-status",
            "-M",
            "-z",
            ...revisions,
        ],
        { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
    );
    const [ stdout, exitCode ] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
    ]);
    if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        // Before the first commit there is no HEAD to diff against, and every
        // file in the tree is new. The untracked pass reports them.
        if (/unknown revision|bad revision|ambiguous argument/i.test(stderr)) {
            return [];
        }
        throw new Error(`git diff failed in ${repoRoot}: ${stderr.trim()}`);
    }

    // With -z the records are not line-oriented: a status field is followed by
    // one path, or by two when the status carries a similarity score, as
    // renames and copies do.
    const fields = stdout.split("\0").filter((field) => field !== "");
    const paths: string[] = [];
    for (let i = 0; i < fields.length;) {
        const status = fields[i]!;
        i++;
        const takesTwoPaths = status.startsWith("R") || status.startsWith("C");
        const count = takesTwoPaths ? 2 : 1;
        for (let taken = 0; taken < count && i < fields.length; taken++) {
            paths.push(fields[i]!);
            i++;
        }
    }
    return paths;
}

/** New files git can see: untracked, and not ignored. */
async function untrackedFiles(repoRoot: string): Promise<string[]> {
    return listFiles(repoRoot, [ "--others", "--exclude-standard" ]);
}

async function listFiles(
    repoRoot: string,
    selectors: string[],
): Promise<string[]> {
    const proc = Bun.spawn(
        [ "git", "ls-files", "-z", ...selectors ],
        { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
    );
    const [ stdout, exitCode ] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
    ]);
    if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`git ls-files failed in ${repoRoot}: ${stderr.trim()}`);
    }
    return stdout.split("\0").filter((path) => path.length > 0);
}

/** Whether the repository has a commit, so that HEAD names something. */
async function hasCommits(repoRoot: string): Promise<boolean> {
    const proc = Bun.spawn(
        [ "git", "rev-parse", "--verify", "--quiet", "HEAD" ],
        { cwd: repoRoot, stdout: "ignore", stderr: "ignore" },
    );
    return await proc.exited === 0;
}

/**
 * Where this branch left the base.
 *
 * Comparing against the base's tip would blame the branch for every file the
 * base changed since it was cut, which sends a reader to a commit they did not
 * write.
 */
async function mergeBase(repoRoot: string, base: string): Promise<string> {
    const proc = Bun.spawn(
        [ "git", "merge-base", base, "HEAD" ],
        { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
    );
    const [ stdout, exitCode ] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
    ]);
    if (exitCode !== 0) {
        throw new Error(
            `Cannot compare against \`${base}\`: no merge base with HEAD. `
                + "Name a ref this branch actually descends from.",
        );
    }
    return stdout.trim();
}

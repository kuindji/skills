/**
 * When each file was last committed.
 *
 * Staleness is measured against commit dates rather than filesystem mtimes,
 * because an mtime says when a checkout happened, not when anyone last thought
 * about the document. A fresh clone would make every doc in the repo look
 * current.
 *
 * One `git log` pass rather than one call per file. A docs root of a few
 * hundred files is ordinary, and a subprocess each would make the validator
 * slow enough that people stop running it.
 */

/** Repo-relative path to the ISO date of the commit that last touched it. */
export type CommitDates = Map<string, string>;

export async function lastCommitDates(
    repoRoot: string,
): Promise<CommitDates> {
    const proc = Bun.spawn(
        // `core.quotePath=false` for the same reason `git ls-files` is asked
        // for NUL-separated output: git otherwise octal-escapes any path
        // outside ASCII, and the escaped form never matches the real one, so
        // the file silently has no commit date and is never stale.
        [
            "git",
            "-c",
            "core.quotePath=false",
            "log",
            // Without this, a merge commit lists no files at all, so a
            // document whose only recent change arrived through a merge keeps
            // the date of the commit before it and is reported stale months
            // early. Diffing a merge against its first parent is the same
            // question a reader asks: when did this last change on this line
            // of history.
            "--diff-merges=first-parent",
            "--pretty=format:%x00%cI",
            "--name-only",
        ],
        { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
    );
    const [ stdout, exitCode ] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
    ]);
    if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        // A repository with no commits yet is not an error: nothing has a
        // commit date, and every staleness rule correctly says nothing.
        if (/does not have any commits yet|unknown revision/i.test(stderr)) {
            return new Map();
        }
        throw new Error(`git log failed in ${repoRoot}: ${stderr.trim()}`);
    }

    const dates: CommitDates = new Map();
    // Commits arrive newest first, so the first date seen for a path is the
    // most recent one and later, older commits do not overwrite it.
    for (const commit of stdout.split("\0")) {
        const [ date, ...paths ] = commit.split("\n");
        if (date === undefined || date.trim() === "") {
            continue;
        }
        for (const path of paths) {
            if (path !== "" && !dates.has(path)) {
                dates.set(path, date.trim());
            }
        }
    }
    return dates;
}

/**
 * Whole days between a commit date and now.
 *
 * Returns undefined for a file git has never seen, which is the honest answer
 * for something uncommitted: it has no history to be stale against.
 */
export function daysSince(
    isoDate: string | undefined,
    now: Date,
): number | undefined {
    if (isoDate === undefined) {
        return undefined;
    }
    const then = new Date(isoDate);
    if (Number.isNaN(then.getTime())) {
        return undefined;
    }
    return Math.floor((now.getTime() - then.getTime()) / 86_400_000);
}

/**
 * Whether the repository's history is truncated.
 *
 * It matters because staleness is measured from commit dates, and in a shallow
 * clone the dates it can see are not the real ones: everything older than the
 * boundary either reports the boundary commit's date or nothing at all. CI
 * checkouts default to a depth of one, so this is the ordinary case there
 * rather than an exotic one, and a validator quietly giving the wrong answer
 * is worse than one that says it cannot tell.
 */
export async function isShallowRepository(repoRoot: string): Promise<boolean> {
    const proc = Bun.spawn(
        [ "git", "rev-parse", "--is-shallow-repository" ],
        { cwd: repoRoot, stdout: "pipe", stderr: "ignore" },
    );
    const [ stdout, exitCode ] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
    ]);
    return exitCode === 0 && stdout.trim() === "true";
}

import { realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

/**
 * Where a path really is.
 *
 * Two rules in this system compare paths against a repository root, and both
 * are wrong if they compare text. A symlink means a path inside the repository
 * can name a file outside it — `docs/specs/x.md` pointing at `/tmp/x.md` is a
 * file git tracks, classifies and hands to a writer. And on macOS the reverse
 * happens with no symlink in the repository at all: `/tmp` and `/var` are
 * symlinks, git reports the resolved form as the repository root, and a caller
 * hands over whichever form it holds, so the same file under its two names
 * compares as two different places.
 */

/**
 * `realpath`, for a path that may not exist yet.
 *
 * A pre-write check asks about a file before anything has written it, so
 * resolving the path itself fails. What can be resolved is its deepest
 * existing ancestor, which is where every symlink in the path actually is.
 */
export async function resolveThroughLinks(path: string): Promise<string> {
    const rest: string[] = [];
    let current = resolve(path);
    for (;;) {
        try {
            const real = await realpath(current);
            return rest.length === 0 ? real : join(real, ...rest);
        }
        catch {
            const parent = dirname(current);
            if (parent === current) {
                return resolve(path);
            }
            rest.unshift(basename(current));
            current = parent;
        }
    }
}

/** Whether a path is really inside a directory, symlinks followed. */
export async function isInside(
    directory: string,
    path: string,
): Promise<boolean> {
    const [ root, target ] = await Promise.all([
        resolveThroughLinks(directory),
        resolveThroughLinks(path),
    ]);
    return target.startsWith(`${root}/`);
}

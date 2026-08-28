/**
 * Whether a declared pattern claims a path.
 *
 * One matcher, used everywhere a profile names paths: product `paths`, owner
 * `paths`, and `generated_paths`. They are the same question asked three
 * times, and answering it three ways would mean a path could belong to a
 * product but not to its owner for no reason a reader could see.
 *
 * A claim is deliberately broader than a glob match. Profiles are written by
 * hand, and the natural way to claim a directory is to name it: `packages/ui`
 * means the package, not the one file whose path is exactly that. So a claim
 * matches when the pattern names the path, contains it, glob-matches it, or
 * glob-matches the leading segments of it, which is what lets `packages/notes-*`
 * cover `packages/notes-domain/src/index.ts`.
 */
export function claims(pattern: string, path: string): boolean {
    // A trailing slash is the natural way to write a directory and would
    // otherwise match nothing at all: `packages/ui/` never equals a file, never
    // prefixes one as `packages/ui//`, and glob-matches nothing. Left alone it
    // silently turns the claim off, which for an owner means the guard stops
    // refusing writes it was installed to refuse.
    const claim = stripTrailingSlash(pattern);
    if (claim === "") {
        return false;
    }
    const target = stripTrailingSlash(path);

    if (target === claim || target.startsWith(`${claim}/`)) {
        return true;
    }
    const glob = new Bun.Glob(claim);
    if (glob.match(target)) {
        return true;
    }
    // A glob naming a directory should claim what is inside it, so
    // `packages/notes-*` covers `packages/notes-domain/src/index.ts`.
    const head = target.split("/").slice(0, claim.split("/").length).join("/");
    return glob.match(head);
}

/** Whether two declared patterns could ever claim the same file. */
export function patternsCollide(a: string, b: string): boolean {
    return claims(a, b) || claims(b, a);
}

function stripTrailingSlash(value: string): string {
    let end = value.length;
    while (end > 0 && value[end - 1] === "/") {
        end--;
    }
    return value.slice(0, end);
}

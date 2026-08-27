import type { Owner, Profile } from "./types";

/**
 * Which owner claims a path.
 *
 * Ownership answers "may this clone write here". It is a different partition
 * from product membership: a shared package belongs to one owner but is
 * consumed by every product.
 *
 * Explicit claims are checked before the default owner, so the default only
 * ever receives what nothing else wanted. That order is what lets one owner
 * express "everything not owned by another clone", which no union of globs can
 * state directly.
 */
export function ownerForPath(
    profile: Profile,
    repoRelativePath: string,
): Owner | undefined {
    if (profile.owners.length === 0) {
        return undefined;
    }
    const explicit = profile.owners.filter((owner) => !owner.isDefault);
    for (const owner of explicit) {
        if (claims(owner, repoRelativePath)) {
            return owner;
        }
    }
    const fallback = profile.owners.find((owner) => owner.isDefault);
    if (fallback && claims(fallback, repoRelativePath)) {
        return fallback;
    }
    return fallback;
}

export interface WriteVerdict {
    allowed: boolean;
    /** Present when the write is refused. Names who owns the path instead. */
    reason?: string;
}

/**
 * Whether the current clone may write a path.
 *
 * The rule exists because several clones of one repo sit side by side, each
 * scoped to its own product. A write landing in the wrong clone is not caught
 * by any test: it commits work into a tree another agent is also editing.
 */
export function writeIsAllowed(
    profile: Profile,
    currentOwner: string | undefined,
    repoRelativePath: string,
): WriteVerdict {
    if (profile.owners.length === 0) {
        return { allowed: true };
    }

    if (currentOwner === undefined) {
        return {
            allowed: false,
            reason:
                "This repo declares owners, but the current owner could not be "
                + "resolved. Write an `.agent-owner` file at the clone root "
                + "naming which owner this clone is.",
        };
    }

    const known = profile.owners.some((owner) => owner.name === currentOwner);
    if (!known) {
        return {
            allowed: false,
            reason: `\`${currentOwner}\` is not a declared owner. Declared: `
                + `${profile.owners.map((o) => o.name).join(", ")}.`,
        };
    }

    const owner = ownerForPath(profile, repoRelativePath);
    if (owner === undefined || owner.name === currentOwner) {
        return { allowed: true };
    }

    const shared = owner.shared ? " (a shared owner)" : "";
    return {
        allowed: false,
        reason:
            `\`${repoRelativePath}\` is owned by \`${owner.name}\`${shared}, `
            + `not by \`${currentOwner}\`. Make this change in the `
            + `\`${owner.name}\` clone, push, then pull it here.`,
    };
}

/** A path is claimed if it equals, sits under, or glob-matches a claim. */
function claims(owner: Owner, path: string): boolean {
    return owner.paths.some((pattern) => {
        if (path === pattern || path.startsWith(`${pattern}/`)) {
            return true;
        }
        const glob = new Bun.Glob(pattern);
        if (glob.match(path)) {
            return true;
        }
        // A glob naming a directory should claim what is inside it, so
        // `packages/sleep-*` covers `packages/sleep-domain/src/index.ts`.
        const firstSegments = path.split("/").slice(
            0,
            pattern.split("/").length,
        ).join("/");
        return glob.match(firstSegments);
    });
}

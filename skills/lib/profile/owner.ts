import { claims as pathClaims } from "./paths";
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
    return resolveOwner(profile, repoRelativePath)?.owner;
}

export interface OwnerMatch {
    owner: Owner;
    /**
     * How the owner came to claim this path. `explicit` means the owner listed
     * a pattern covering it; `default` means nobody listed it and the default
     * owner takes it by complement.
     *
     * The distinction is the difference between "this is mine" and "nobody
     * said". Root configuration, lockfiles and stray top-level documents all
     * land in the second group, and treating them with the confidence of the
     * first turns the guard into something people switch off.
     */
    via: "explicit" | "default";
}

/** Which owner claims a path, and on what basis. */
export function resolveOwner(
    profile: Profile,
    repoRelativePath: string,
): OwnerMatch | undefined {
    if (profile.owners.length === 0) {
        return undefined;
    }
    // Explicit owners first, in the order they were declared, and only then
    // the default owner's own list. Overlapping paths are a schema error, but
    // the profile still parses and the guard still has to answer, so the
    // precedence is fixed here rather than left to declaration order.
    const explicit = profile.owners.filter((owner) => !owner.isDefault);
    const fallback = profile.owners.find((owner) => owner.isDefault);
    for (const owner of [ ...explicit, ...(fallback ? [ fallback ] : []) ]) {
        if (ownerClaims(owner, repoRelativePath)) {
            return { owner, via: "explicit" };
        }
    }
    return fallback === undefined
        ? undefined
        : { owner: fallback, via: "default" };
}

/** A path is claimed if any of the owner's declared patterns claims it. */
function ownerClaims(owner: Owner, path: string): boolean {
    return owner.paths.some((pattern) => pathClaims(pattern, path));
}

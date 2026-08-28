import { resolveOwner } from "../profile/owner";
import { claims } from "../profile/paths";
import type { Diagnostic, Profile } from "../profile/types";

/**
 * What a change is not allowed to touch.
 *
 * Two rules, both about paths rather than content. A generated file must not
 * be hand-edited, because the edit is lost the next time the generator runs
 * and the divergence is invisible until it is expensive. And a clone must not
 * write outside its own scope, because several clones of one repository sit
 * side by side and a write in the wrong one commits into a tree another agent
 * is editing — a collision no test catches.
 *
 * The input is a list of paths, not a diff, and that is the load-bearing
 * decision. Measured against a real Expo monorepo, all four of its declared
 * generated patterns are gitignored and have never been tracked in 701
 * commits, while more than five thousand such files sit on disk waiting to be
 * opened. A guard that could only read `git diff` would report that repository
 * perfectly clean while missing every path it was installed to protect. Taking
 * paths from the caller lets the same rules answer both "what does this diff
 * touch" and "may I write this file", and the second question is the one that
 * reaches the ignored trees.
 */

export interface GuardInput {
    profile: Profile;
    /** Which clone this is. Undefined when it could not be resolved. */
    currentOwner?: string;
    /** Repo-relative paths the change touches. */
    paths: string[];
    /**
     * Paths the caller has named as deliberate. Generated output does change
     * legitimately — someone runs the generator and commits the result — and
     * nothing in the file says whether a generator or a person wrote it. So
     * the refusal is lifted per path, by naming it, which keeps the act
     * deliberate and leaves a record of what was regenerated.
     */
    acknowledged?: string[];
}

export function guardChange(input: GuardInput): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    // An acknowledgement goes through the same gate as a changed path. The
    // lenient side of a guard must not accept a form the strict side rejects:
    // `/hasura/x.yaml` is refused outright as a changed path, so letting it
    // acknowledge one would make the escape hatch the widest door in the room.
    const acknowledged = new Set(
        (input.acknowledged ?? [])
            .filter(isRepoRelative)
            .map(normalise)
            .filter((path) => path !== ""),
    );

    // Callers do not all name a file the way git does: an editor hook hands
    // over an absolute path, a shell hands over `./name`. A path the rules
    // cannot match is the one thing a guard must not shrug at, so the two
    // forms part company here. A leading `./` means exactly what its absence
    // means and is dropped; an absolute path or one climbing through `..`
    // cannot be resolved without knowing the repo root, and guessing would
    // attribute `docs/../apps/detector/x.ts` to whoever owns `docs`.
    const paths: string[] = [];
    for (const raw of [ ...input.paths ].sort()) {
        if (!isRepoRelative(raw) || normalise(raw) === "") {
            diagnostics.push({
                file: raw,
                keyPath: "",
                rule: "guard.unrelativePath",
                message:
                    "This path does not name a file relative to the repository "
                    + "root, so no rule here can tell what it refers to.",
                remedy: "Pass paths as git reports them: relative to the "
                    + "repository root, with no leading `/` and no `..` "
                    + "segments.",
                severity: "error",
            });
            continue;
        }
        paths.push(normalise(raw));
    }

    for (const path of paths) {
        if (acknowledged.has(path)) {
            continue;
        }
        const pattern = input.profile.generatedPaths.find((candidate) =>
            claims(candidate, path)
        );
        if (pattern === undefined) {
            continue;
        }
        diagnostics.push({
            file: path,
            keyPath: "generated_paths",
            rule: "guard.generatedPath",
            message:
                `This file is generated: \`generated_paths\` claims it through `
                + `\`${pattern}\`. An edit here is overwritten the next time `
                + "the generator runs.",
            remedy: "Change whatever produces this file and run the generator "
                + "again. If this change is that regeneration, name the path "
                + "explicitly to acknowledge it.",
            severity: "error",
        });
    }

    return [ ...diagnostics, ...ownerDiagnostics(input, paths) ]
        .sort((a, b) => a.file.localeCompare(b.file));
}

function ownerDiagnostics(
    input: GuardInput,
    paths: string[],
): Diagnostic[] {
    const { profile, currentOwner } = input;
    // A repo with one clone has no scope to leave.
    if (profile.owners.length === 0) {
        return [];
    }

    // Reported once for the change rather than once per path: the answer is
    // about the clone, and repeating it per file buries every other finding.
    if (currentOwner === undefined) {
        return [ {
            file: profile.sourcePath,
            keyPath: "owners",
            rule: "guard.ownerUnresolved",
            message: "This repo declares owners, so a write has to be checked "
                + "against one, and which clone this is could not be "
                + "determined.",
            remedy:
                "Write an `.agent-owner` file at the clone root naming this "
                + "clone's owner, or rename the clone directory to match one "
                + `of: ${ownerNames(profile)}.`,
            severity: "error",
        } ];
    }

    if (!profile.owners.some((owner) => owner.name === currentOwner)) {
        return [ {
            file: profile.sourcePath,
            keyPath: "owners",
            rule: "guard.unknownOwner",
            message:
                `\`${currentOwner}\` is not a declared owner, so there is no `
                + "scope to check this change against.",
            remedy: `Declare it under \`owners\`, or correct it to one of: `
                + `${ownerNames(profile)}.`,
            severity: "error",
        } ];
    }

    const diagnostics: Diagnostic[] = [];
    const sharedPaths: string[] = [];
    const unclaimedPaths: string[] = [];
    for (const path of paths) {
        const match = resolveOwner(profile, path);
        if (match === undefined) {
            // Owners are declared and none claims this path, not even a
            // default one. That is a profile that has not said who owns it,
            // and "nobody owns this" is not permission to write it.
            unclaimedPaths.push(path);
            continue;
        }

        if (match.owner.name === currentOwner) {
            // An allowed write, with one thing left to check. Only for a path
            // the owner actually listed: a shared owner that is also the
            // default would otherwise ask for a consumer audit of every
            // unclaimed file in the repo, most of which have no consumers.
            if (match.owner.shared && match.via === "explicit") {
                sharedPaths.push(path);
            }
            continue;
        }

        if (match.via === "explicit") {
            const shared = match.owner.shared ? ", a shared owner" : "";
            diagnostics.push({
                file: path,
                keyPath: "owners",
                rule: "guard.ownerScope",
                message: `\`${match.owner.name}\`${shared} owns this path, not `
                    + `\`${currentOwner}\`.`,
                remedy:
                    `Make this change in the \`${match.owner.name}\` clone, `
                    + "push it, and pull it here. Editing it from this clone "
                    + "writes into a tree another agent may be working in.",
                severity: "error",
            });
            continue;
        }

        // Reached the default owner through its complement: nobody claimed
        // this path, which is where root configuration and lockfiles live.
        // Real history shows product clones committing those routinely, and
        // refusing them would refuse every dependency install.
        unclaimedPaths.push(path);
    }

    if (unclaimedPaths.length > 0) {
        diagnostics.push({
            file: unclaimedPaths[0]!,
            keyPath: "owners",
            rule: "guard.unclaimedPath",
            message: unclaimedMessage(profile, currentOwner, unclaimedPaths),
            remedy:
                "Fine for root configuration and lockfiles, which every clone "
                + "touches. If it is anything else, add it to an owner's "
                + "`paths` so the next change gets a real answer.",
            severity: "warning",
        });
    }

    // Once for the change rather than once per file. The remedy is a
    // repository-wide typecheck, which is run once however many files moved;
    // repeated per file it buries every other finding, and did, at 1,162
    // copies across 701 replayed commits.
    if (sharedPaths.length > 0) {
        diagnostics.push({
            file: sharedPaths[0]!,
            keyPath: "owners",
            rule: "guard.sharedBlastRadius",
            message:
                `\`${currentOwner}\` is a shared owner, so this change has `
                + `consumers outside its own tree: ${naming(sharedPaths)}.`,
            remedy: "Before committing, run the repository-wide typecheck and "
                + "lint so every dependent is verified, not just this package.",
            severity: "warning",
        });
    }
    return diagnostics;
}

function ownerNames(profile: Profile): string {
    return profile.owners.map((owner) => owner.name).join(", ");
}

/**
 * What to say about paths no owner claims.
 *
 * With a default owner they land somewhere, just not by anyone's decision.
 * Without one they land nowhere at all, which is a gap in the profile rather
 * than a question of precedence, and the two deserve different sentences.
 */
function unclaimedMessage(
    profile: Profile,
    currentOwner: string,
    paths: string[],
): string {
    const fallback = profile.owners.find((owner) => owner.isDefault);
    const subject = paths.length === 1
        ? "this path"
        : `these ${paths.length} paths`;
    const them = paths.length === 1 ? "it" : "them";
    const lands = fallback === undefined
        ? `and no default owner is declared to take ${them}`
        : `so ${them === "it" ? "it falls" : "they fall"} to `
            + `\`${fallback.name}\` by default rather than by anyone's decision`;
    return `No owner claims ${subject}, ${lands}. `
        + `This clone is \`${currentOwner}\`: ${naming(paths)}.`;
}

/**
 * Name a few of the paths and say how many more there are.
 *
 * A warning about the change still has to say which files it is about, or the
 * reader has to reconstruct it. Listing all of them is what made these
 * unreadable in the first place.
 */
function naming(paths: string[]): string {
    const shown = paths.slice(0, 3).map((path) => `\`${path}\``).join(", ");
    const rest = paths.length - 3;
    return rest > 0 ? `${shown} and ${rest} more` : shown;
}

export interface WriteVerdict {
    allowed: boolean;
    /** Present when the write is refused. Says who owns the path, or why. */
    reason?: string;
}

/**
 * Whether one write may go ahead.
 *
 * The same rules as `guardChange`, asked about a single path, because that is
 * the question a pre-write check has: not "what did this change do" but "may I
 * write this file". A warning is not a refusal — it is something to know
 * afterwards, and blocking on it would block routine work.
 */
export function writeIsAllowed(
    profile: Profile,
    currentOwner: string | undefined,
    repoRelativePath: string,
): WriteVerdict {
    const refusals = guardChange({
        profile,
        currentOwner,
        paths: [ repoRelativePath ],
    }).filter((diagnostic) => diagnostic.severity === "error");

    if (refusals.length === 0) {
        return { allowed: true };
    }
    return {
        allowed: false,
        reason: refusals
            .map((d) => `${d.message} ${d.remedy}`)
            .join(" "),
    };
}

/**
 * Whether a path can be matched against the profile's patterns at all.
 *
 * An absolute path and a path containing a `..` segment both name a file the
 * rules cannot locate without the repository root, which this function does
 * not have. Matching them as text is worse than refusing them: `docs/../x`
 * begins with `docs/` and would be handed to whoever owns `docs`.
 */
function isRepoRelative(path: string): boolean {
    if (path.startsWith("/")) {
        return false;
    }
    // A Windows drive letter or a UNC path is absolute too, and neither is
    // something git would report.
    if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\")) {
        return false;
    }
    return !path.split("/").includes("..");
}

/** The plain form of a repo-relative path: no `./`, no empty segments. */
function normalise(path: string): string {
    const segments = path
        .split("/")
        .filter((segment) => segment !== "" && segment !== ".");
    return segments.join("/");
}

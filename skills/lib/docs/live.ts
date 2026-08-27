import type { Diagnostic } from "../profile/types";
import { type CommitDates, daysSince } from "./git";

/**
 * The one rule the `live` class carries: review age.
 *
 * A `live` document is not under the lifecycle. It has no status to move
 * through and nothing marks it finished, because it claims to be permanently
 * current: a README, a roadmap, a house-rules file. That claim is what makes
 * it dangerous. A stale plan is visibly a plan from a moment; a stale README
 * reads as a description of today and is believed as one.
 *
 * Nothing in the prose of such a document can say when it was last true, so
 * the only available signal is when anyone last committed it. That is a weak
 * signal deliberately used weakly: it produces a warning asking someone to
 * look, never an error, because a document can be both untouched and correct.
 */

export interface LiveRules {
    /** A `live` document untouched this long is flagged for review. */
    reviewAfterDays: number;
    commitDates: CommitDates;
    now: Date;
}

/** Check every document in the `live` class. */
export function validateLiveDocs(
    paths: string[],
    rules: LiveRules,
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const path of paths) {
        // A file git has never seen has no history to be stale against. That
        // is the honest answer rather than the alarming one: an uncommitted
        // document was written just now, not left for a year.
        const days = daysSince(rules.commitDates.get(path), rules.now);
        if (days === undefined || days <= rules.reviewAfterDays) {
            continue;
        }
        diagnostics.push({
            file: path,
            keyPath: "",
            rule: "docs.reviewAge",
            message:
                `This document claims to describe the present and has not been `
                + `committed for ${days} days, over the `
                + `${rules.reviewAfterDays}-day review limit.`,
            remedy:
                "Read it against what is true now. Correct what has drifted, "
                + "or commit it unchanged to record that it was checked. If "
                + "nothing in it describes the present, it belongs in "
                + "`reference`, where nothing expects it to.",
            severity: "warning",
        });
    }

    return diagnostics;
}

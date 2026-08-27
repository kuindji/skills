import type { Frontmatter } from "../markdown/frontmatter";
import type { Diagnostic } from "../profile/types";
import { bodyHash } from "./freeze";
import { type CommitDates, daysSince } from "./git";

/**
 * The rules for documents under lifecycle control: specs and plans.
 *
 * They apply to this class and no other, which is the whole point of having
 * classes. Measured against a real docs root, 125 of its files are not
 * date-named and nearly all of them are legitimately permanent: research
 * reports, privacy policies, branding assets, device checklists. A blanket
 * naming rule would have made every one of them a violation, and a validator
 * that reports 125 faults on a correct repository gets switched off.
 *
 * What separates this class is that its documents stop being true. A spec
 * records what was decided at a moment; a plan tracks work that finishes.
 * Nothing else in a docs root has that shape, and nothing currently marks the
 * transition, which is the only moment folding into the wiki reliably happens.
 */

/** The three states a lifecycle document moves through. */
export const STATUSES = [ "draft", "active", "shipped" ] as const;
export type Status = (typeof STATUSES)[number];

/** `2026-08-27-project-management-skills-design.md` */
const NAME_RE = /^(\d{4})-(\d{2})-(\d{2})-(.+)\.md$/;

export interface DocFile {
    /** Repo-relative path. */
    path: string;
    frontmatter: Frontmatter;
}

export interface LifecycleRules {
    /** An `active` document untouched this long is flagged. */
    staleAfterDays: number;
    /** Wiki slugs a `folded_into` entry may point at. */
    wikiSlugs: Set<string>;
    commitDates: CommitDates;
    now: Date;
}

/** Check every document in the `lifecycle` class. */
export function validateLifecycleDocs(
    docs: DocFile[],
    rules: LifecycleRules,
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    // `supersedes` has to name a document that exists, so the set of them is
    // built before any is checked.
    const known = new Map(docs.map((doc) => [ doc.path, doc ]));

    for (const doc of docs) {
        checkName(doc, diagnostics);
        const status = checkContract(doc, diagnostics);
        if (status === "shipped") {
            checkFolded(doc, rules, diagnostics);
            checkFrozen(doc, known, diagnostics);
        }
        if (status === "active") {
            checkStale(doc, rules, diagnostics);
        }
    }
    return diagnostics;
}

/**
 * The filename carries the date.
 *
 * A lifecycle document is a record of a moment, and the moment belongs in the
 * name where it is visible in a directory listing, a git log and a link,
 * rather than only inside the file. Sorting by name then sorts by decision
 * order, which is how anyone reads a specs folder.
 */
function checkName(doc: DocFile, out: Diagnostic[]): void {
    const name = doc.path.split("/").pop() ?? doc.path;
    const match = NAME_RE.exec(name);

    if (!match) {
        out.push({
            file: doc.path,
            keyPath: "",
            rule: "docs.lifecycleName",
            message: `\`${name}\` is not named \`YYYY-MM-DD-topic.md\`.`,
            remedy:
                "Rename it with the date it was written in front. If it is not "
                + "a document that records a moment, it is in the wrong class: "
                + "move its glob to `reference` or `live`, where nothing "
                + "expects a date.",
            severity: "error",
        });
        return;
    }

    const [ , year, month, day ] = match;
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    const real = !Number.isNaN(date.getTime())
        && date.getUTCMonth() + 1 === Number(month)
        && date.getUTCDate() === Number(day);
    if (!real) {
        out.push({
            file: doc.path,
            keyPath: "",
            rule: "docs.lifecycleName",
            message: `\`${year}-${month}-${day}\` is not a real date.`,
            remedy: "Correct the date in the filename.",
            severity: "error",
        });
    }
}

/** `type` and `status` are required, and `status` is one of three. */
function checkContract(doc: DocFile, out: Diagnostic[]): Status | undefined {
    const { values, lines } = doc.frontmatter;

    if (!doc.frontmatter.present) {
        out.push({
            file: doc.path,
            keyPath: "",
            rule: "docs.lifecycleFrontmatter",
            message: "The document has no frontmatter block.",
            remedy: "Add one carrying `type` and `status`. Without a status "
                + "nothing marks the moment the document stops being open, "
                + "and that moment is the only one at which folding it into "
                + "the wiki reliably happens.",
            severity: "error",
        });
        return undefined;
    }

    const type = values["type"];
    if (typeof type !== "string" || type.trim() === "") {
        out.push({
            file: doc.path,
            keyPath: "type",
            line: lines["type"],
            rule: "docs.lifecycleFrontmatter",
            message: "`type` is missing or empty.",
            remedy: "Add `type:` naming what kind of document this is, for "
                + "example `spec`, `plan`, `research` or `handover`.",
            severity: "error",
        });
    }

    const status = values["status"];
    if (typeof status !== "string" || !isStatus(status)) {
        out.push({
            file: doc.path,
            keyPath: "status",
            line: lines["status"],
            rule: "docs.lifecycleStatus",
            message: `\`status\` must be one of ${STATUSES.join(", ")}, and is `
                + `\`${describe(status)}\`.`,
            remedy: "Set it to `draft` while the document is being written, "
                + "`active` while the work it describes is open, and `shipped` "
                + "when that work closes and the document is frozen.",
            severity: "error",
        });
        return undefined;
    }

    return status;
}

/**
 * A shipped document says where its content went.
 *
 * Shipping is the moment the wiki is supposed to absorb what was learned, and
 * it is the only moment at which that reliably happens. `folded_into` is the
 * evidence that it did, and requiring the slugs to resolve is what stops the
 * evidence from being a gesture.
 */
function checkFolded(
    doc: DocFile,
    rules: LifecycleRules,
    out: Diagnostic[],
): void {
    const { values, lines } = doc.frontmatter;
    const folded = values["folded_into"];
    const line = lines["folded_into"];

    if (!Array.isArray(folded) || folded.length === 0) {
        out.push({
            file: doc.path,
            keyPath: "folded_into",
            line,
            rule: "docs.foldGate",
            message:
                "A `shipped` document must carry `folded_into` naming the wiki "
                + "pages that absorbed it.",
            remedy:
                "Fold what is still true into the wiki, then list the slugs "
                + "here. Shipping without folding leaves the durable knowledge "
                + "in a document nobody reads again, and it goes stale where "
                + "no rule can see it.",
            severity: "error",
        });
        return;
    }

    for (const slug of folded) {
        if (typeof slug !== "string" || !rules.wikiSlugs.has(slug)) {
            out.push({
                file: doc.path,
                keyPath: "folded_into",
                line,
                rule: "docs.foldGate",
                message: `\`${describe(slug)}\` does not resolve to a wiki `
                    + "page.",
                remedy: "A slug is the page's path under the wiki root without "
                    + "`.md`. Correct it, or write the page it should point "
                    + "at.",
                severity: "error",
            });
        }
    }
}

/**
 * A shipped document's body matches the hash recorded when it shipped.
 *
 * The exemptions are the two honest reasons to edit a frozen document:
 * `supersedes` says a newer document replaces this one, and `reopened_reason`
 * says the decision itself was reopened. Both leave a record. Silently editing
 * one leaves none, and the reader has no way to tell that what they are
 * reading is not what was decided.
 */
function checkFrozen(
    doc: DocFile,
    known: Map<string, DocFile>,
    out: Diagnostic[],
): void {
    const { values, lines, body } = doc.frontmatter;
    const recorded = values["frozen_body_sha256"];

    if (typeof recorded !== "string" || recorded.trim() === "") {
        out.push({
            file: doc.path,
            keyPath: "frozen_body_sha256",
            line: lines["frozen_body_sha256"],
            rule: "docs.frozen",
            message: "A `shipped` document must carry `frozen_body_sha256`.",
            remedy:
                "Run `docs-freeze` on it. It computes the hash and writes it "
                + "in, which is the moment the document becomes a record "
                + "rather than a draft.",
            severity: "error",
        });
        return;
    }

    const actual = bodyHash(body);
    if (actual === recorded) {
        return;
    }

    const reopened = values["reopened_reason"];
    if (typeof reopened === "string" && reopened.trim() !== "") {
        return;
    }

    const supersedes = values["supersedes"];
    if (typeof supersedes === "string" && supersedes.trim() !== "") {
        const target = resolveSupersedes(supersedes, doc, known);
        if (target !== undefined) {
            return;
        }
        // An unresolvable `supersedes` is the more dangerous case, not the
        // lesser one: it reads as an accounted-for edit and exempts the
        // document from the freeze forever.
        out.push({
            file: doc.path,
            keyPath: "supersedes",
            line: lines["supersedes"],
            rule: "docs.supersedes",
            message: `\`${supersedes}\` does not name a later lifecycle `
                + "document in this repository.",
            remedy:
                "Point it at the document that replaces this one, by path or "
                + "by filename, and make sure that document is dated no "
                + "earlier than this one. An edit excused by a document that "
                + "does not exist is an unexplained edit.",
            severity: "error",
        });
        return;
    }

    out.push({
        file: doc.path,
        keyPath: "frozen_body_sha256",
        line: lines["frozen_body_sha256"],
        rule: "docs.frozen",
        message: "The body has changed since this document shipped. Recorded "
            + `\`${recorded.slice(0, 12)}\`, found \`${actual.slice(0, 12)}\`.`,
        remedy:
            "Revert the body, or say why it moved: `supersedes:` pointing at "
            + "the document that replaces this one, or `reopened_reason:` "
            + "explaining what reopened the decision. Formatting is already "
            + "exempt, because the hash ignores line endings and trailing "
            + "whitespace, so this is a change to the prose.",
        severity: "error",
    });
}

/**
 * An active document nobody has touched has probably finished without saying
 * so. That is the failure the lifecycle exists to catch: work closes, the plan
 * stops being edited, and nothing folds it into the wiki because nothing marks
 * the transition.
 */
function checkStale(
    doc: DocFile,
    rules: LifecycleRules,
    out: Diagnostic[],
): void {
    const days = daysSince(rules.commitDates.get(doc.path), rules.now);
    if (days === undefined || days <= rules.staleAfterDays) {
        return;
    }
    out.push({
        file: doc.path,
        keyPath: "status",
        line: doc.frontmatter.lines["status"],
        rule: "docs.stale",
        message: `The document is \`active\` and has not been committed for `
            + `${days} days, over the ${rules.staleAfterDays}-day limit.`,
        remedy:
            "If the work finished, ship it: fold what is still true into the "
            + "wiki, list those slugs in `folded_into`, and set `status: "
            + "shipped`. If it did not, say what moved by committing the "
            + "document.",
        severity: "warning",
    });
}

/**
 * The document a `supersedes` value names, if it is a real and later one.
 *
 * Accepts a repo-relative path or a bare filename, because both read
 * naturally in frontmatter and neither is ambiguous: lifecycle filenames
 * carry a date and a topic.
 */
function resolveSupersedes(
    value: string,
    doc: DocFile,
    known: Map<string, DocFile>,
): DocFile | undefined {
    const wanted = value.trim();
    const target = known.get(wanted)
        ?? [ ...known.values() ].find((candidate) =>
            candidate.path.split("/").pop() === wanted
        );
    if (target === undefined || target.path === doc.path) {
        return undefined;
    }
    // A document can only be replaced by a later one. Dates come from the
    // filenames, which is where this class keeps them.
    const from = dateOf(doc.path);
    const to = dateOf(target.path);
    if (from !== undefined && to !== undefined && to < from) {
        return undefined;
    }
    return target;
}

/** The `YYYY-MM-DD` a lifecycle filename starts with. */
function dateOf(path: string): string | undefined {
    const name = path.split("/").pop() ?? path;
    return NAME_RE.exec(name)?.slice(1, 4).join("-");
}

function isStatus(value: string): value is Status {
    return (STATUSES as readonly string[]).includes(value);
}

function describe(value: unknown): string {
    return value === undefined ? "absent" : String(value);
}

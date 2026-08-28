import { isInside } from "../links";
import { parseFrontmatter } from "../markdown/frontmatter";
import type { Diagnostic, DocClass, Profile } from "../profile/types";
import { classifyDocPaths } from "./classify";
import { listRepoFiles } from "./git";

/**
 * The body hash that freezes a shipped document.
 *
 * A shipped spec is frozen: it records what was decided, and editing it
 * rewrites history that later decisions were made against. Immutability is
 * enforced by hashing rather than by git, because git-based immutability fires
 * on all the routine things that are not rewrites: a rebase, a formatting
 * sweep, a frontmatter migration, or a wiki slug rename that forces a
 * `folded_into` link update.
 *
 * Hashing the body after the frontmatter is what makes that distinction
 * mechanical. Metadata and link maintenance stay legal; the substance stays
 * frozen. It also removes the chicken-and-egg problem of writing a hash into a
 * file the hash covers.
 */

/**
 * Normalise a body before hashing.
 *
 * Line endings go to `\n`, trailing whitespace goes from every line, and the
 * leading and trailing blank lines go from the whole. The spec asks for the
 * hash to survive a formatting sweep, and stripping only the document's final
 * newline would not: the commonest thing a formatter does is remove trailing
 * spaces from lines it otherwise leaves alone. Reflowing a paragraph does
 * change the hash, which is correct. That is an edit to the prose.
 *
 * Blank lines are removed, not whitespace. Trimming the whole string would
 * also eat the indentation of the first line, and in Markdown that
 * indentation is content: `    # Decision` is a code block and `# Decision`
 * is a heading, and the two must not hash alike.
 */
export function normaliseBody(body: string): string {
    return body
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.replace(/[ \t]+$/, ""))
        .join("\n")
        .replace(/^\n+/, "")
        .replace(/\n+$/, "");
}

/** The recorded `frozen_body_sha256` of a document body. */
export function bodyHash(body: string): string {
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(normaliseBody(body));
    return hasher.digest("hex");
}

/**
 * Writing the hash in.
 *
 * `docs-freeze` is the other half of the mechanism the validator enforces. A
 * shipped document must carry `frozen_body_sha256`, and computing a SHA-256 by
 * hand at the moment of shipping is the kind of step nobody performs, so the
 * rule would be enforced against a key that never gets written.
 *
 * It writes one key and nothing else. The spec excludes auto-applying
 * lifecycle transitions, so the author still sets `status: shipped` and
 * `folded_into` themselves: freezing is the mechanical half of shipping, and
 * deciding that the work is done is not.
 */

/** How the frontmatter delimiters of a document are laid out. */
interface Block {
    /** Lines of the frontmatter head, each keeping its own line terminator. */
    lines: string[];
    /** Index in `lines` of the closing `---`. */
    close: number;
    /** Everything after the closing delimiter, byte for byte. */
    body: string;
    /** A byte-order mark that was present before the opening delimiter. */
    bom: string;
    /** The line ending the block already uses, so an inserted line matches. */
    eol: string;
}

export interface FreezeOptions {
    /**
     * Overwrite a hash that is already recorded and no longer matches.
     *
     * Off by default, because that case is exactly the rewrite the freeze
     * exists to catch. Passing it is the author saying the edit is intended.
     */
    refreeze?: boolean;
}

/** What freezing one document did, or declined to do. */
export type FreezeOutcome =
    | {
        kind: "frozen";
        path: string;
        hash: string;
        /** The full file to write. */
        content: string;
        /** The hash this replaced, when the document was frozen before. */
        previous?: string;
        /** Frontmatter keys removed, because they were exemptions now spent. */
        cleared: string[];
    }
    | { kind: "unchanged"; path: string; hash: string; }
    | { kind: "refused"; path: string; diagnostic: Diagnostic; };

/**
 * The exemptions the validator honours when a frozen body no longer matches.
 *
 * `reopened_reason` says the decision was reopened. Writing a hash is what
 * ends the reopening, so the key is spent by any freeze and not only by a
 * refreeze: a document that ships carrying both a hash and a reason is exempt
 * from every later edit, silently, with nothing in the file to show that the
 * exemption was already used up.
 *
 * `supersedes` is not on this list. It says a later document replaces this
 * one, which stays true after the hash moves.
 */
const SPENT_ON_FREEZE = [ "reopened_reason" ];

/**
 * Decide what freezing one document would do, without touching the disk.
 *
 * Pure, so every refusal and every rewrite is testable against a string. The
 * caller supplies the path for the diagnostics only.
 */
export function planFreeze(
    path: string,
    raw: string,
    options: FreezeOptions = {},
): FreezeOutcome {
    const refuse = (
        rule: string,
        message: string,
        remedy: string,
        keyPath = "",
    ): FreezeOutcome => ({
        kind: "refused",
        path,
        diagnostic: {
            file: path,
            keyPath,
            rule,
            message,
            remedy,
            severity: "error",
        },
    });

    const parsed = parseFrontmatter(raw);
    if (!parsed.present) {
        return refuse(
            "freeze.noFrontmatter",
            "The document has no frontmatter block to write the hash into.",
            "Add one carrying `type` and `status` first. A block holding only "
                + "a hash would record what the body said without recording "
                + "that anyone decided it was finished.",
        );
    }

    const block = splitBlock(raw, parsed.body);
    // A block that parsed to nothing while visibly holding something is
    // broken YAML, and every check below would report the keys it can see as
    // missing. Saying "`status` is absent" about a file whose second line
    // reads `status: shipped` sends the author hunting for the wrong problem.
    // The parser answers this, rather than a count of keys against a count of
    // lines: a block holding only comments has no keys and parses perfectly,
    // and calling that broken YAML is the same wrong answer in the other
    // direction.
    if (parsed.malformed) {
        return refuse(
            "freeze.badFrontmatter",
            "The frontmatter block did not parse, so nothing in it can be "
                + "read.",
            "A tab used for indentation and an unquoted value holding a colon "
                + "are the two that most often do this. A flow collection "
                + "split over several lines is the third, and that one is "
                + "valid YAML the parser here does not accept: write it on one "
                + "line, or as an indented block list.",
        );
    }

    const status = parsed.values["status"];
    if (status !== "shipped") {
        return refuse(
            "freeze.notShipped",
            `\`status\` is \`${
                status === undefined ? "absent" : String(status)
            }\`, and only a \`shipped\` document is frozen.`,
            "Set `status: shipped` when the work the document describes has "
                + "closed, and fold what is still true into the wiki first. "
                + "Freezing an open document freezes prose that is still "
                + "being written, and the hash then reads as a decision "
                + "nobody made.",
            "status",
        );
    }

    if (normaliseBody(parsed.body) === "") {
        return refuse(
            "freeze.emptyBody",
            "The document has no body below its frontmatter.",
            "Write what was decided. A hash over an empty body records "
                + "nothing and passes the validator forever.",
        );
    }

    const hash = bodyHash(parsed.body);
    // Anything recorded counts as frozen, whatever YAML made of it. A hash
    // the parser turned into a number is still the author saying this
    // document was frozen once, and treating it as absent would overwrite it
    // without the refusal that exists to make that deliberate. An empty value
    // is the exception: writing the bare key and running the tool is how the
    // key gets filled.
    const recorded = parsed.values["frozen_body_sha256"];
    const previous = recorded === undefined || recorded === null
        ? undefined
        : String(recorded).trim();

    if (previous === hash) {
        return { kind: "unchanged", path, hash };
    }

    if (
        previous !== undefined && previous !== "" && options.refreeze !== true
    ) {
        return refuse(
            "freeze.alreadyFrozen",
            "The document is already frozen and its body has changed since. "
                + `Recorded \`${previous.slice(0, 12)}\`, found \`${
                    hash.slice(0, 12)
                }\`.`,
            "Revert the body if the change was not meant. If it was, that is "
                + "a rewrite of a shipped record: say so with `reopened_reason:"
                + "`, or point `supersedes:` at the document that replaces "
                + "this one, and re-run with `--refreeze` to move the hash.",
            "frozen_body_sha256",
        );
    }

    const cleared = SPENT_ON_FREEZE.filter(
        (key) => parsed.values[key] !== undefined,
    );

    let lines = block.lines;
    let close = block.close;
    const dropped: string[] = [];
    for (const key of [ ...cleared, "frozen_body_sha256" ]) {
        const removal = removeKey(lines, close, key);
        lines = removal.lines;
        close = removal.close;
        dropped.push(...removal.dropped);
    }

    // Deleting a line that defines an anchor leaves every alias to it
    // dangling, and the file saved would not parse at all. The writer cannot
    // know what the author meant the alias to carry, so it declines rather
    // than guessing: a refusal is recoverable and a corrupt document is not.
    const anchor = dropped.find((line) => ANCHOR_RE.test(line));
    if (anchor !== undefined) {
        return refuse(
            "freeze.anchoredKey",
            `A key the freeze has to rewrite defines a YAML anchor: `
                + `\`${anchor.trim()}\`.`,
            "Remove the anchor, or move it to a key the freeze does not "
                + "touch. Rewriting the key would delete the anchor and leave "
                + "every alias to it unresolved, which makes the whole block "
                + "unreadable.",
            "frozen_body_sha256",
        );
    }

    lines.splice(close, 0, `frozen_body_sha256: ${hash}${block.eol}`);

    return {
        kind: "frozen",
        path,
        hash,
        content: block.bom + lines.join("") + block.body,
        ...(previous === undefined || previous === "" ? {} : { previous }),
        cleared,
    };
}

/**
 * Split a file into its frontmatter lines and its body, keeping every byte.
 *
 * The body comes back untouched rather than re-joined, because rewriting it
 * would change the hash that was just computed over it: a document written
 * with CRLF would be frozen under one hash and saved under another.
 */
function splitBlock(raw: string, body: string): Block {
    const bom = raw.charCodeAt(0) === 0xFEFF ? "\uFEFF" : "";
    const source = bom === "" ? raw : raw.slice(1);
    const head = source.slice(0, source.length - body.length);
    // Split after each newline, so each line carries its own terminator and
    // a file mixing CRLF and LF survives a rewrite of one of its lines.
    const lines = head.split(/(?<=\n)/);
    // The head is exactly what the frontmatter regex matched, so its last
    // line is the delimiter that closed the block. Searching forwards for the
    // first `---` instead found a different delimiter whenever the block's
    // own first line was one: the hash was then spliced into a phantom empty
    // block and every key that authorised the freeze was pushed below the
    // closing delimiter, into the body, where nothing reads it.
    const close = lines.findLastIndex(
        (line, index) => index > 0 && /^---[ \t]*\r?\n?$/.test(line),
    );
    return {
        lines,
        close,
        body,
        bom,
        eol: head.includes("\r\n") ? "\r\n" : "\n",
    };
}

/** `key: &anchor ...`, the shape that cannot be deleted safely. */
const ANCHOR_RE = /:\s*&[A-Za-z0-9_-]+/;

/** A top-level key, written bare or quoted. Both are the same key to YAML. */
function keyRe(key: string): RegExp {
    return new RegExp(`^(?:${key}|"${key}"|'${key}')\\s*:`);
}

/**
 * Drop every top-level occurrence of a key, and the lines that belong to it.
 *
 * Every occurrence, because YAML resolves a duplicated key to the last one:
 * replacing only the first would leave the stale hash winning while the file
 * visibly carried the new one. Quoted, because `"frozen_body_sha256":` is the
 * same key and would otherwise survive as that duplicate.
 *
 * Indented lines below a key are its value, so they go with it; a list left
 * behind would attach itself to whatever key came next. So do the blank lines
 * between them, which a literal block scalar is free to contain, but only once
 * an indented line proves the value continued past them. A blank line before
 * the next key is a separator and stays.
 */
function removeKey(
    lines: string[],
    close: number,
    key: string,
): { lines: string[]; close: number; dropped: string[]; } {
    const kept: string[] = [];
    const dropped: string[] = [];
    // Blank lines whose owner is not yet known: the value below them, or the
    // key after them.
    let pending: string[] = [];
    let dropping = false;
    const re = keyRe(key);

    for (const [ index, line ] of lines.entries()) {
        const inBlock = index > 0 && index < close;

        if (dropping) {
            if (inBlock && line.trim() === "") {
                pending.push(line);
                continue;
            }
            if (inBlock && /^[ \t]/.test(line)) {
                dropped.push(...pending, line);
                pending = [];
                continue;
            }
            kept.push(...pending);
            pending = [];
            dropping = false;
        }

        if (inBlock && re.test(line)) {
            dropped.push(line);
            dropping = true;
            continue;
        }
        kept.push(line);
    }

    return { lines: kept, close: close - dropped.length, dropped };
}

export interface FreezeRunOptions extends FreezeOptions {
    /**
     * Repo-relative paths to freeze.
     *
     * Omitted or empty means every shipped lifecycle document in the repo,
     * which is the shape of a release: several plans close at once and each
     * needs the same key written.
     */
    paths?: string[];
    /** Compute the outcomes without writing anything. */
    dryRun?: boolean;
}

/**
 * Freeze documents in a repository on disk.
 *
 * The class comes from the profile rather than from the path, because freezing
 * is a lifecycle obligation and nothing else carries it. A README is a live
 * document that is supposed to keep changing; a hash over it would turn every
 * legitimate update into a reported rewrite.
 */
export async function freezeDocs(
    profile: Profile,
    repoRoot: string,
    options: FreezeRunOptions = {},
): Promise<FreezeOutcome[]> {
    const base = repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`;
    const repoPaths = await listRepoFiles(repoRoot);
    const { files } = classifyDocPaths(profile, repoPaths);
    const classOf = new Map(files.map((file) => [ file.path, file.docClass ]));
    const named = options.paths ?? [];
    const sweep = named.length === 0;

    const targets = sweep
        ? files.filter((file) => file.docClass === "lifecycle").map((f) =>
            f.path
        )
        : named;

    const outcomes: FreezeOutcome[] = [];
    for (const path of targets) {
        const docClass = classOf.get(path);
        if (docClass !== "lifecycle") {
            outcomes.push(notLifecycle(path, docClass, repoPaths));
            continue;
        }
        // A tracked symlink is a path inside the repository naming a file
        // outside it, and this is the only place in the system that writes.
        // Measured: a repo holding `docs/specs/2026-08-28-outside.md ->
        // /tmp/outside.md` had that file rewritten by a bare `docs-freeze`,
        // which then reported no problems.
        if (!await isInside(repoRoot, `${base}${path}`)) {
            outcomes.push(outsideRepository(path));
            continue;
        }

        const outcome = planFreeze(
            path,
            await Bun.file(`${base}${path}`).text(),
            options,
        );
        // A sweep names no document, so it cannot complain that one it found
        // is still open: a specs directory is mostly drafts, and reporting
        // each of them as a failure is how a tool stops being run. Naming the
        // path is the author asserting it is ready, and then the refusal is
        // the answer they asked for.
        if (sweep && outcome.kind === "refused" && isOpen(outcome)) {
            continue;
        }
        if (outcome.kind === "frozen" && options.dryRun !== true) {
            await Bun.write(`${base}${path}`, outcome.content);
        }
        outcomes.push(outcome);
    }
    return outcomes;
}

/** A document whose path leaves the repository through a link. */
function outsideRepository(path: string): FreezeOutcome {
    return {
        kind: "refused",
        path,
        diagnostic: {
            file: path,
            keyPath: "",
            rule: "freeze.outsideRepository",
            message:
                "This path is a link to a file outside the repository, and "
                + "freezing it would write there.",
            remedy:
                "Move the document into the repository, or drop it from the "
                + "lifecycle globs. A decision recorded outside the repository "
                + "cannot be frozen against it: nothing here can tell when the "
                + "other side changes.",
            severity: "error",
        },
    };
}

/** Refusals that only say the document has not shipped yet. */
function isOpen(outcome: FreezeOutcome & { kind: "refused"; }): boolean {
    return outcome.diagnostic.rule === "freeze.notShipped"
        || outcome.diagnostic.rule === "freeze.noFrontmatter";
}

function notLifecycle(
    path: string,
    docClass: DocClass | undefined,
    repoPaths: string[],
): FreezeOutcome {
    const exists = repoPaths.includes(path);
    return {
        kind: "refused",
        path,
        diagnostic: {
            file: path,
            keyPath: "",
            rule: "freeze.notLifecycle",
            message: !exists
                ? "No such file in this repository."
                : docClass === undefined
                ? "The file matches no declared doc class."
                : `The file is in the \`${docClass}\` class, and only `
                    + "`lifecycle` documents are frozen.",
            remedy: !exists
                ? "Paths are repo-relative. Check the spelling, and that the "
                    + "file is committed or at least not ignored: freezing "
                    + "reads the repository as git sees it."
                : "Freezing records that a document stopped changing, which "
                    + "only the lifecycle classes do. A live document is "
                    + "supposed to keep changing, and a hash over one would "
                    + "report every legitimate update as a rewrite. If this "
                    + "document does record a decision, move its glob to "
                    + "`docs.lifecycle`.",
            severity: "error",
        },
    };
}

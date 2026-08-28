import { resolve } from "node:path";
import { resolveThroughLinks } from "../links";
import { loadProfiles } from "../profile/load";
import type { Diagnostic, Profile } from "../profile/types";
import { type Args, value } from "./args";
import { EXIT, type Io, report } from "./report";

/**
 * What every bin needs before it can check anything: which repository it is
 * looking at, and what that repository declares about itself.
 */

export interface Context {
    repoRoot: string;
    /** The repo-wide profile. Also the default product in a single-product repo. */
    root: Profile;
    /** Per-product profiles, empty in the common single-product case. */
    products: Profile[];
    /** Nested repositories that were skipped. */
    boundaries: string[];
    /** Problems found while loading, to be reported alongside the bin's own. */
    diagnostics: Diagnostic[];
}

/**
 * Find the repository root.
 *
 * An explicit path wins, because tests and CI both need to point a validator
 * at a tree that is not the working directory. Otherwise it is git's answer,
 * so running a validator from three directories down checks the whole repo
 * rather than reporting that a subdirectory has no profile.
 */
export async function resolveRepoRoot(
    given: string | undefined,
    cwd: string,
): Promise<string> {
    if (given !== undefined) {
        return resolve(cwd, given);
    }
    return await gitToplevel(cwd) ?? resolve(cwd);
}

/** The root of the work tree a directory belongs to, if it belongs to one. */
async function gitToplevel(cwd: string): Promise<string | undefined> {
    const proc = Bun.spawn(
        [ "git", "rev-parse", "--show-toplevel" ],
        { cwd, stdout: "pipe", stderr: "ignore" },
    );
    const [ stdout, exitCode ] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
    ]);
    return exitCode === 0 && stdout.trim() !== "" ? stdout.trim() : undefined;
}

/**
 * Where this directory stands in relation to a git work tree.
 *
 * Two questions, one answer, because both are about the frame git reports
 * paths in. Every rule downstream asks git for the file list, so a directory
 * outside a work tree cannot be checked at all. And `git ls-files` run in a
 * subdirectory lists paths relative to that subdirectory, so classification
 * works and looks correct, while `git log` names the same files relative to
 * the repository root and no commit date matches a document: measured on a
 * repository whose only document was last touched in January 2024 with
 * `review_after_days: 30`, pointing `--repo` at the subdirectory holding the
 * profile reported no problems at all.
 */
async function standing(
    repoRoot: string,
): Promise<
    { kind: "root"; } | { kind: "inside"; root: string; } | { kind: "outside"; }
> {
    const toplevel = await gitToplevel(repoRoot);
    if (toplevel === undefined) {
        return { kind: "outside" };
    }
    const [ here, root ] = await Promise.all([
        resolveThroughLinks(resolve(repoRoot)),
        resolveThroughLinks(toplevel),
    ]);
    return here === root ? { kind: "root" } : { kind: "inside", root };
}

function notARepository(repoRoot: string): Diagnostic {
    return {
        file: repoRoot,
        keyPath: "",
        rule: "cli.notARepository",
        message: `${repoRoot} is not inside a git repository, and every rule `
            + "here reads the list of files to check from git.",
        remedy:
            "Point --repo at a git repository, or run `git init` here if this "
            + "is meant to be one. Nothing was checked.",
        severity: "error",
    };
}

function notRepositoryRoot(repoRoot: string, root: string): Diagnostic {
    return {
        file: repoRoot,
        keyPath: "",
        rule: "cli.notRepositoryRoot",
        message:
            `This directory sits inside the repository at ${root} rather than `
            + "being its root, so commit dates are recorded against paths that "
            + "do not match the documents here, and document age cannot be "
            + "measured.",
        remedy: `Point --repo at ${root}, or run the validator from there. `
            + "Every other rule still applies to this directory; only the ones "
            + "that read history are silent.",
        severity: "warning",
    };
}

export type Loaded =
    | { kind: "context"; context: Context; }
    /** Nothing could be checked. The reason has already been reported. */
    | { kind: "unusable"; code: number; };

/**
 * Load the profiles a bin will work from, or report why it cannot run.
 *
 * A missing or unparseable profile exits `unusable` rather than `failed`. The
 * difference matters to whatever runs these: a repository that fails its rules
 * has work to do, while a repository that cannot be read at all has a tool
 * pointed at the wrong place, and a CI job that cannot tell them apart will
 * treat the second as the first.
 */
export async function loadContext(
    args: Args,
    io: Io,
    tool: string,
): Promise<Loaded> {
    const repoRoot = await resolveRepoRoot(value(args, "repo"), process.cwd());
    const json = args.booleans.has("json");

    // Asked before anything is read. Without git there is no file list, so
    // every check below would fail on the same call, and it would fail by
    // throwing: a stack trace where a diagnostic belongs, under an exit code
    // that says the repository broke a rule.
    const where = await standing(repoRoot);
    if (where.kind === "outside") {
        report(io, [ notARepository(repoRoot) ], { tool, json });
        return { kind: "unusable", code: EXIT.unusable };
    }

    const loaded = await loadProfiles(repoRoot);

    if (!loaded.index) {
        report(io, loaded.diagnostics, { tool, json });
        return { kind: "unusable", code: EXIT.unusable };
    }

    return {
        kind: "context",
        context: {
            repoRoot,
            root: loaded.index.root,
            products: loaded.index.products,
            boundaries: loaded.boundaries,
            diagnostics: where.kind === "inside"
                ? [
                    ...loaded.diagnostics,
                    notRepositoryRoot(repoRoot, where.root),
                ]
                : loaded.diagnostics,
        },
    };
}

/** Every profile that can classify a file: the root and each product. */
export function allProfiles(context: Context): Profile[] {
    return [ context.root, ...context.products ];
}

/**
 * Turn a path as a caller typed it into the repo-relative form the rules use.
 *
 * Callers do not all name a file the way git does: a shell completes
 * `./docs/specs/x.md`, an editor hook hands over an absolute path, and a
 * person running the tool from a subdirectory types a name relative to where
 * they are. Every rule in this system matches against repo-relative paths, so
 * a form that is not normalised here matches nothing, and `undefined` says the
 * path could not be placed rather than guessing at it.
 *
 * Symlinks are followed on both sides, which is what makes this work at all on
 * macOS: `/tmp` and `/var` are symlinks there, git reports the resolved form as
 * the repository root, and a hook hands over whichever form the editor holds.
 * Compared as text, the same file under its two names is not inside its own
 * repository — measured, a guard pointed at `/var/folders/…/repo` refused
 * `/private/var/folders/…/repo/build/x.ts`, which is precisely the pre-write
 * call it exists to answer.
 */
export async function toRepoRelative(
    given: string,
    repoRoot: string,
    cwd: string,
): Promise<string | undefined> {
    const absolute = await resolveThroughLinks(resolve(cwd, given));
    const root = await resolveThroughLinks(resolve(repoRoot));
    if (absolute === root || !absolute.startsWith(`${root}/`)) {
        return undefined;
    }
    return absolute.slice(root.length + 1);
}

/** The diagnostic for a path that is not inside the repository. */
export function outsideRepository(
    given: string,
    repoRoot: string,
): Diagnostic {
    return {
        file: given,
        keyPath: "",
        rule: "cli.outsideRepository",
        message: `\`${given}\` is not inside ${repoRoot}.`,
        remedy: "Name a path inside the repository being checked, or point "
            + "`--repo` at the repository this path belongs to.",
        severity: "error",
    };
}

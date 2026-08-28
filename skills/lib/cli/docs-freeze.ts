import { classifyDocPaths } from "../docs/classify";
import { freezeDocs, type FreezeOutcome } from "../docs/freeze";
import { listRepoFiles } from "../docs/git";
import type { Diagnostic, Profile } from "../profile/types";
import { preflight } from "./args";
import { dedupe } from "./checks";
import {
    allProfiles,
    type Context,
    loadContext,
    outsideRepository,
    toRepoRelative,
} from "./context";
import { EXIT, type Io, report } from "./report";

const TOOL = "docs-freeze";

const HELP = `Usage: docs-freeze [<path>...] [--repo <dir>] [--refreeze]
                   [--dry-run] [--json]

Writes frozen_body_sha256 into shipped lifecycle documents. With no paths it
sweeps every shipped lifecycle document in the repository; documents that have
not shipped are passed over silently. Naming a path is the author asserting it
is ready, so a named document that cannot be frozen says why.

  --repo <dir>  Repository to work in. Defaults to the enclosing git repository.
  --refreeze    Overwrite a recorded hash that no longer matches. That mismatch
                is the rewrite the freeze exists to catch, so passing this is
                the author saying the edit is intended.
  --dry-run     Report what would be written without writing it.
  --json        Print one JSON object instead of prose.
  -h, --help    Show this.`;

const SPEC = {
    booleans: [ "refreeze", "dry-run", "json", "help" ],
    values: [ "repo" ],
    aliases: { h: "help", n: "dry-run" },
};

export async function run(argv: string[], io: Io): Promise<number> {
    const args = preflight(argv, SPEC, HELP, io);
    if (typeof args === "number") {
        return args;
    }
    const loaded = await loadContext(args, io, TOOL);
    if (loaded.kind === "unusable") {
        return loaded.code;
    }
    const { context } = loaded;
    const json = args.booleans.has("json");
    const options = {
        refreeze: args.booleans.has("refreeze"),
        dryRun: args.booleans.has("dry-run"),
    };

    const diagnostics: Diagnostic[] = [ ...context.diagnostics ];
    const named: string[] = [];
    for (const given of args.positionals) {
        const path = await toRepoRelative(
            given,
            context.repoRoot,
            process.cwd(),
        );
        if (path === undefined) {
            diagnostics.push(outsideRepository(given, context.repoRoot));
            continue;
        }
        named.push(path);
    }
    // A path the tool could not place is not a reason to freeze the rest of
    // them: the caller named a set, and acting on part of it while reporting
    // the remainder as an error leaves them guessing which half was written.
    if (diagnostics.some((d) => d.rule === "cli.outsideRepository")) {
        report(io, diagnostics, { tool: TOOL, json });
        return EXIT.unusable;
    }

    const outcomes = named.length === 0
        ? await sweep(context, options)
        : await freezeNamed(context, named, options);

    for (const outcome of outcomes) {
        if (outcome.kind === "refused") {
            diagnostics.push(outcome.diagnostic);
        }
    }

    const notes = outcomes
        .filter((outcome) => outcome.kind !== "refused")
        .map((outcome) => describe(outcome, options.dryRun));
    // Only when the sweep found nothing at all. Saying it under a refusal
    // would report a clean sweep and an error about the same run.
    if (notes.length === 0 && named.length === 0 && diagnostics.length === 0) {
        notes.push("No shipped lifecycle document needed a hash.");
    }

    return report(io, dedupe(diagnostics), { tool: TOOL, notes, json });
}

interface Options {
    refreeze: boolean;
    dryRun: boolean;
}

/** Freeze everything shipped, once per profile that declares lifecycle docs. */
async function sweep(
    context: Context,
    options: Options,
): Promise<FreezeOutcome[]> {
    const outcomes: FreezeOutcome[] = [];
    for (const profile of allProfiles(context)) {
        if (!profile.docs) {
            continue;
        }
        outcomes.push(
            ...await freezeDocs(profile, context.repoRoot, options),
        );
    }
    return outcomes;
}

/**
 * Freeze the documents a caller named, each under the profile that owns it.
 *
 * A named path has to be handed to the profile whose lifecycle globs cover it,
 * because freezing is a lifecycle obligation and every other profile in the
 * repo would correctly refuse the same file for not being one of its own. A
 * path no profile claims goes to the root profile, whose refusal is the
 * answer: nothing here places this document under lifecycle control.
 */
async function freezeNamed(
    context: Context,
    named: string[],
    options: Options,
): Promise<FreezeOutcome[]> {
    const repoPaths = await listRepoFiles(context.repoRoot);
    const owner = new Map<string, Profile>();
    for (const profile of allProfiles(context)) {
        for (const file of classifyDocPaths(profile, repoPaths).files) {
            if (file.docClass === "lifecycle" && !owner.has(file.path)) {
                owner.set(file.path, profile);
            }
        }
    }

    const groups = new Map<Profile, string[]>();
    for (const path of named) {
        const profile = owner.get(path) ?? context.root;
        const group = groups.get(profile) ?? [];
        group.push(path);
        groups.set(profile, group);
    }

    const outcomes: FreezeOutcome[] = [];
    for (const [ profile, paths ] of groups) {
        outcomes.push(
            ...await freezeDocs(profile, context.repoRoot, {
                ...options,
                paths,
            }),
        );
    }
    return outcomes;
}

function describe(
    outcome: FreezeOutcome & { kind: "frozen" | "unchanged"; },
    dryRun: boolean,
): string {
    const short = outcome.hash.slice(0, 12);
    if (outcome.kind === "unchanged") {
        return `${outcome.path}: already frozen at ${short}.`;
    }
    const verb = dryRun ? "would freeze" : "frozen";
    const parts = [ `${outcome.path}: ${verb} at ${short}` ];
    if (outcome.previous !== undefined) {
        parts.push(`replacing ${outcome.previous.slice(0, 12)}`);
    }
    if (outcome.cleared.length > 0) {
        parts.push(`clearing ${outcome.cleared.join(", ")}`);
    }
    return `${parts.join(", ")}.`;
}

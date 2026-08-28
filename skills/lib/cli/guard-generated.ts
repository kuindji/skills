import { changedPaths } from "../guard/changes";
import { guardChange } from "../guard/generated";
import { resolveCurrentOwner } from "../profile/clone";
import type { Diagnostic } from "../profile/types";
import { preflight, value, values } from "./args";
import { dedupe } from "./checks";
import { loadContext, outsideRepository, toRepoRelative } from "./context";
import { EXIT, type Io, report } from "./report";

const TOOL = "guard-generated";

const HELP = `Usage: guard-generated [<path>...] [--repo <dir>] [--base <ref>]
                       [--acknowledge <path>]... [--owner <name>] [--json]

Refuses a change that edits generated output, or writes outside the scope of
the clone it is running in. With no paths it reads the working tree's change:
staged, unstaged and untracked, both sides of a rename.

Pass paths directly to ask about files git cannot see. Generated trees are
usually gitignored, so a diff is exactly the wrong place to look for them.

  --repo <dir>          Repository to check. Defaults to the enclosing one.
  --base <ref>          Also include what this branch changed since <ref>,
                        measured from the merge base.
  --acknowledge <path>  Permit a generated path this once. Regeneration is
                        legitimate and nothing in the file says whether a
                        generator or a person wrote it, so the refusal is
                        lifted per path, deliberately, and leaves a record.
  --owner <name>        Act as this clone's owner instead of resolving it.
  --json                Print one JSON object instead of prose.
  -h, --help            Show this.`;

const SPEC = {
    booleans: [ "json", "help" ],
    values: [ "repo", "base", "acknowledge", "owner" ],
    aliases: { h: "help" },
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
    const cwd = process.cwd();

    const unplaceable: Diagnostic[] = [];
    const place = async (given: string): Promise<string | undefined> => {
        const path = await toRepoRelative(given, context.repoRoot, cwd);
        if (path === undefined) {
            unplaceable.push(outsideRepository(given, context.repoRoot));
        }
        return path;
    };

    // Absolute paths are normalised here rather than in the rules, because
    // this is the layer that knows the repository root. A pre-write hook hands
    // over `/Users/…/apps/quiz/x.ts`, and a guard that could not place that
    // path would refuse the one call shape it exists to answer.
    const named = (await Promise.all(args.positionals.map(place)))
        .filter((path): path is string => path !== undefined);
    const acknowledged =
        (await Promise.all(values(args, "acknowledge").map(place)))
            .filter((path): path is string => path !== undefined);

    if (unplaceable.length > 0) {
        report(io, [ ...context.diagnostics, ...unplaceable ], {
            tool: TOOL,
            json,
        });
        return EXIT.unusable;
    }

    const base = value(args, "base");
    // Naming paths and naming a base ref ask two different questions, and only
    // one of them can be answered. Silently dropping the base would tell a
    // caller who asked about a branch that the three files they also listed
    // are clean, which reads as an answer about the branch.
    if (named.length > 0 && base !== undefined) {
        io.err(
            "`--base` asks about a branch and naming paths asks about those "
                + "paths. Pass one or the other.",
        );
        return EXIT.unusable;
    }

    let paths: string[];
    if (named.length > 0) {
        paths = named;
    }
    else {
        try {
            paths = await changedPaths(
                context.repoRoot,
                base === undefined ? {} : { base },
            );
        }
        catch (error) {
            // Reading the change is the one step here that talks to git about
            // something the caller supplied. A ref that does not exist is a
            // caller mistake, and it arrived as a stack trace under exit 1 —
            // the code that says the repository broke a rule.
            report(io, [ {
                file: context.repoRoot,
                keyPath: "",
                rule: "guard.unreadableChange",
                message: `The change could not be read: ${message(error)}`,
                remedy:
                    "Check the `--base` ref, or drop it to read the working "
                    + "tree's change. Nothing was checked.",
                severity: "error",
            } ], { tool: TOOL, json });
            return EXIT.unusable;
        }
    }

    const currentOwner = value(args, "owner")
        ?? await resolveCurrentOwner(context.repoRoot);

    const diagnostics = guardChange({
        profile: context.root,
        currentOwner,
        paths,
        acknowledged,
    });

    const counted = `${paths.length} path${paths.length === 1 ? "" : "s"}`;
    const notes = [
        named.length > 0
            ? `${counted} named.`
            : `${counted} in the working tree's change`
                + `${base === undefined ? "" : ` against ${base}`}.`,
    ];
    if (context.root.owners.length > 0) {
        notes.push(
            `Acting as \`${currentOwner ?? "an unresolved owner"}\`.`,
        );
    }

    return report(io, dedupe([ ...context.diagnostics, ...diagnostics ]), {
        tool: TOOL,
        notes,
        json,
    });
}

/** The text of a thrown value, whatever it turned out to be. */
function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

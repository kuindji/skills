import { validateGeneratedPaths } from "../guard/declared";
import { type Args, preflight } from "./args";
import { type Check, dedupe } from "./checks";
import { type Context, loadContext } from "./context";
import { type Io, plural, report } from "./report";

const TOOL = "profile-validate";

const HELP = `Usage: profile-validate [--repo <dir>] [--json]

Checks the project profiles: schema, product paths that do not overlap, owner
scopes, and declared patterns that still match something.

  --repo <dir>  Repository to check. Defaults to the enclosing git repository.
  --json        Print one JSON object instead of prose.
  -h, --help    Show this.`;

const SPEC = {
    booleans: [ "json", "help" ],
    values: [ "repo" ],
    aliases: { h: "help" },
};

/**
 * The profile's own rules.
 *
 * Schema, product and owner checking happen while the profiles are loaded,
 * because everything else needs the result. What is left for this check is the
 * question loading cannot answer from the file alone: whether the patterns a
 * profile declares still match anything on disk. A `generated_paths` entry
 * that matches nothing reads, in review, as protection that is not there.
 */
export async function checkProfile(context: Context): Promise<Check> {
    const diagnostics = await validateGeneratedPaths(
        context.repoRoot,
        context.root,
    );

    const notes = [
        context.products.length === 0
            ? "1 profile, no separate product profiles."
            : `1 root profile and ${context.products.length} product `
                + `profiles: ${
                    context.products.map((p) => p.product).join(", ")
                }.`,
    ];
    if (context.boundaries.length > 0) {
        notes.push(
            `${context.boundaries.length} nested `
                + `${
                    context.boundaries.length === 1
                        ? "repository"
                        : "repositories"
                } skipped: `
                + `${context.boundaries.join(", ")}.`,
        );
    }

    return { diagnostics, notes };
}

export async function run(argv: string[], io: Io): Promise<number> {
    const args = preflight(argv, SPEC, HELP, io);
    if (typeof args === "number") {
        return args;
    }
    return runWith(args, io);
}

async function runWith(args: Args, io: Io): Promise<number> {
    const loaded = await loadContext(args, io, TOOL);
    if (loaded.kind === "unusable") {
        return loaded.code;
    }
    const { context } = loaded;
    const check = await checkProfile(context);
    return report(
        io,
        dedupe([ ...context.diagnostics, ...check.diagnostics ]),
        {
            tool: TOOL,
            notes: check.notes,
            json: args.booleans.has("json"),
        },
    );
}

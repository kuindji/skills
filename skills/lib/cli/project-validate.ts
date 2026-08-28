import { preflight } from "./args";
import { combine, dedupe } from "./checks";
import { loadContext } from "./context";
import { checkDocs } from "./docs-validate";
import { checkProfile } from "./profile-validate";
import { type Io, report } from "./report";
import { checkWiki } from "./wiki-validate";

const TOOL = "project-validate";

const HELP = `Usage: project-validate [--repo <dir>] [--json]

Runs every check a repository can be held to on its own: the profiles, the
wiki, and the documents. One pass, one report, one exit code.

The write guard is not part of it. That one judges a change rather than a
repository, so its answer depends on what happens to be uncommitted on the
machine it runs on; run guard-generated where the change is.

  --repo <dir>  Repository to check. Defaults to the enclosing git repository.
  --json        Print one JSON object instead of prose.
  -h, --help    Show this.`;

const SPEC = {
    booleans: [ "json", "help" ],
    values: [ "repo" ],
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

    // One context, read once, handed to each check. Running the bins as
    // separate processes would re-read the repository three times and report
    // the same profile error three times with it.
    const check = combine([
        await checkProfile(context),
        await checkWiki(context),
        await checkDocs(context),
    ]);

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

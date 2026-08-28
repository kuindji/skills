import { validateWiki } from "../wiki/scan";
import { preflight } from "./args";
import { type Check, dedupe } from "./checks";
import { type Context, loadContext } from "./context";
import { type Io, plural, report } from "./report";

const TOOL = "wiki-validate";

const HELP = `Usage: wiki-validate [--repo <dir>] [--json]

Checks the wiki declared by the root profile: frontmatter, link symmetry,
reachability, size budget, and the position bans.

  --repo <dir>  Repository to check. Defaults to the enclosing git repository.
  --json        Print one JSON object instead of prose.
  -h, --help    Show this.`;

const SPEC = {
    booleans: [ "json", "help" ],
    values: [ "repo" ],
    aliases: { h: "help" },
};

/**
 * The wiki rules, and the counts that make a clean run mean something.
 *
 * Path citations are always reported, under either policy. Under `citation`
 * they are not a fault, but a project that has sanctioned them still has a
 * right to know it is carrying eleven hundred of them across a hundred pages,
 * which is how the practice gets judged rather than assumed.
 */
export async function checkWiki(context: Context): Promise<Check> {
    const wiki = context.root.wiki;
    if (!wiki) {
        return {
            diagnostics: [],
            notes: [ "No wiki declared, so no wiki rules ran." ],
        };
    }

    const result = await validateWiki(context.root, context.repoRoot);
    const notes = [
        `${plural(result.pages.length, "page")} under ${wiki.root}.`,
        `${plural(result.pathCitations, "file-path reference")} on `
        + `${plural(result.pagesWithPathCitations, "page")} `
        + `(path_citations: ${wiki.pathCitations}).`,
    ];
    return { diagnostics: result.diagnostics, notes };
}

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
    const check = await checkWiki(context);
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

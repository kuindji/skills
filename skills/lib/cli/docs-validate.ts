import type { ClassifiedDoc } from "../docs/classify";
import { checkTrackerCovered } from "../docs/classify";
import { validateDocs } from "../docs/scan";
import { loadWikiPages } from "../wiki/scan";
import { preflight } from "./args";
import { type Check, dedupe } from "./checks";
import { allProfiles, type Context, loadContext } from "./context";
import { type Io, plural, report } from "./report";

const TOOL = "docs-validate";

const HELP = `Usage: docs-validate [--repo <dir>] [--json]

Checks every file under a declared docs root: that it matches exactly one
class, and then the rules of that class — lifecycle naming, frontmatter, the
fold gate and freeze, live review age, and tracker shape.

  --repo <dir>  Repository to check. Defaults to the enclosing git repository.
  --json        Print one JSON object instead of prose.
  -h, --help    Show this.`;

const SPEC = {
    booleans: [ "json", "help" ],
    values: [ "repo" ],
    aliases: { h: "help" },
};

/**
 * The doc rules, run once per profile that declares a docs root.
 *
 * Products carry their own docs configuration, because a repo holding four
 * products holds four sets of specs with four different lifecycles. Two things
 * about a product profile are decided here rather than inside the rules,
 * because only this layer can see the whole repository:
 *
 * The wiki is repo-wide, and a product profile is refused for declaring one.
 * So the slugs a `folded_into` entry may resolve to come from the repository's
 * wiki, once, for every profile. Read per profile, a product would have no
 * slugs at all and every shipped spec it owns would be told the pages it
 * folded into do not exist.
 *
 * And products are checked before the repository, so that a product's docs
 * root sitting inside the repository's does not make every document in it
 * unclassified from the outside.
 */
export async function checkDocs(context: Context): Promise<Check> {
    const diagnostics = [];
    const notes: string[] = [];

    const withDocs = allProfiles(context).filter((profile) => profile.docs);
    if (withDocs.length === 0) {
        // A repository with no docs root still has to answer for its tracker.
        // An in-repo backend and no place to classify the file it names is
        // the same silence as a missing glob, and the one this check exists
        // for.
        return {
            diagnostics: checkTrackerCovered(context.root, []),
            notes: [ "No docs root declared, so no doc rules ran." ],
        };
    }

    const wikiSlugs = new Set(
        (await loadWikiPages(context.root, context.repoRoot))
            .map((page) => page.slug),
    );

    const claimed = new Set<string>();
    // The tracker is repo-wide and the profile that classifies it may be a
    // product's, so the coverage check reads what every profile classified
    // rather than any one result.
    const classified: ClassifiedDoc[] = [];
    const specificFirst = [
        ...withDocs.filter((profile) => profile.product !== undefined),
        ...withDocs.filter((profile) => profile.product === undefined),
    ];

    for (const profile of specificFirst) {
        const result = await validateDocs(profile, context.repoRoot, {
            wikiSlugs,
            claimed,
        });
        for (const doc of result.files) {
            claimed.add(doc.path);
            classified.push(doc);
        }
        diagnostics.push(...result.diagnostics);
        const where = profile.product === undefined
            ? profile.docs?.root
            : `${profile.docs?.root} (${profile.product})`;
        notes.push(
            `${plural(result.files.length, "document")} under ${where}, `
                + `${result.lifecycle.length} of them lifecycle.`,
        );
    }

    diagnostics.push(...checkTrackerCovered(context.root, classified));

    return { diagnostics: dedupe(diagnostics), notes };
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
    const check = await checkDocs(context);
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

import {
    type Diagnostic,
    DOC_CLASSES,
    type DocClass,
    type Profile,
} from "../profile/types";

export interface ClassifiedDoc {
    /** Repo-relative path. */
    path: string;
    docClass: DocClass;
}

export interface ClassifyResult {
    files: ClassifiedDoc[];
    diagnostics: Diagnostic[];
}

export interface ClassifyOptions {
    /**
     * Report declared globs that matched nothing.
     *
     * Only meaningful when the caller passed every file in the repo. A partial
     * list would make most globs look dead.
     */
    reportDeadGlobs?: boolean;
}

/**
 * Assign every file under the docs root to exactly one declared class.
 *
 * Classes exist because a docs root holds several kinds of document with
 * different obligations: a plan is frozen once shipped, a privacy policy never
 * was under that lifecycle, and a branding asset is not prose at all. Applying
 * one rule to the whole directory is what makes a validator get switched off.
 *
 * Pure: takes the paths rather than reading them, so the rules can be tested
 * without a fixture tree on disk.
 */
export function classifyDocPaths(
    profile: Profile,
    repoRelativePaths: string[],
    options: ClassifyOptions = {},
): ClassifyResult {
    const diagnostics: Diagnostic[] = [];
    const files: ClassifiedDoc[] = [];
    const docs = profile.docs;

    // A repo need not have a docs root. Nothing to classify, nothing to say.
    if (!docs) {
        return { files, diagnostics };
    }

    const file = profile.sourcePath;
    const trackerIsInRepo = profile.tracker.backend === "in-repo";

    // The tracker class only means something when the tracker is a file in
    // this repo. Declaring it against ClickUp suggests the author believed
    // task state lived here, which is the confusion the class exists to avoid.
    if (docs.globs.tracker.length > 0 && !trackerIsInRepo) {
        diagnostics.push({
            file,
            keyPath: "docs.tracker",
            rule: "docs.trackerClass",
            message:
                "A `tracker` doc class is declared, but the tracker backend is "
                + `\`${profile.tracker.backend}\`, which holds task state `
                + "outside this repo.",
            remedy:
                "Remove the docs.tracker globs, or change tracker.backend to "
                + `in-repo. With ${profile.tracker.backend}, a file in the repo `
                + "carrying task state would be a second authority.",
            severity: "error",
        });
    }

    // A glob written with a leading slash is repo-root-relative, which is how
    // a file outside the docs tree gets a class. The repo's front door,
    // README.md and AGENTS.md, is a live document by nature but does not live
    // under docs/. Without this it would be silently unvalidated.
    const isRootRelative = (pattern: string) => pattern.startsWith("/");
    const matchedGlobs = new Set<string>();
    const classify = (relative: string, rootRelative: string) => {
        return DOC_CLASSES.filter((docClass) =>
            docs.globs[docClass].some((pattern) => {
                const subject = isRootRelative(pattern)
                    ? rootRelative
                    : relative;
                const target = isRootRelative(pattern)
                    ? pattern.slice(1)
                    : pattern;
                if (subject === undefined) {
                    return false;
                }
                const hit = new Bun.Glob(target).match(subject);
                if (hit) {
                    matchedGlobs.add(`${docClass}:${pattern}`);
                }
                return hit;
            })
        );
    };

    const docsPrefix = withTrailingSlash(docs.root);
    // The wiki has its own validator and its own rules. When it sits inside
    // the docs root, as it usually does, classifying its pages would demand a
    // doc class for every wiki page.
    const wikiPrefix = profile.wiki?.root
        ? withTrailingSlash(profile.wiki.root)
        : undefined;

    // Files outside the docs root are classified only when a root-relative
    // glob names them. They are never swept for "matches no class": that rule
    // governs the docs tree, and applying it repo-wide would demand a class
    // for every source file.
    for (const path of repoRelativePaths) {
        if (!path.startsWith(docsPrefix)) {
            const matched = classify("", path);
            if (matched.length === 1) {
                files.push({ path, docClass: matched[0]! });
                // The tracker checks belong to the path, not to where it
                // sits. A repo whose tracker is a root TODO.md reaches it
                // through a root-relative glob and would otherwise get none
                // of them.
                checkTrackerPlacement(profile, path, matched[0]!, diagnostics);
            }
            else if (matched.length > 1) {
                diagnostics.push({
                    file,
                    keyPath: "docs",
                    rule: "docs.ambiguous",
                    message: `\`${path}\` matches more than one doc class: `
                        + `${matched.join(", ")}.`,
                    remedy: "Narrow the globs so exactly one class claims it.",
                    severity: "error",
                });
            }
            continue;
        }
        if (wikiPrefix !== undefined && path.startsWith(wikiPrefix)) {
            continue;
        }

        const relative = path.slice(docsPrefix.length);
        const matched = classify(relative, path);

        if (matched.length === 0) {
            diagnostics.push({
                file,
                keyPath: "docs",
                rule: "docs.unclassified",
                message: `\`${path}\` matches no declared doc class.`,
                remedy: "Add a glob for it under one of: "
                    + `${DOC_CLASSES.join(", ")}. Use \`ignored\` if it is `
                    + "deliberately outside the rules, so the exclusion is "
                    + "visible rather than silent.",
                severity: "error",
            });
            continue;
        }

        if (matched.length > 1) {
            diagnostics.push({
                file,
                keyPath: "docs",
                rule: "docs.ambiguous",
                message: `\`${path}\` matches more than one doc class: `
                    + `${matched.join(", ")}.`,
                remedy: "Narrow the globs so exactly one class claims it. Two "
                    + "classes mean two sets of obligations, and nothing "
                    + "decides which applies.",
                severity: "error",
            });
            continue;
        }

        const docClass = matched[0]!;
        files.push({ path, docClass });
        checkTrackerPlacement(profile, path, docClass, diagnostics);
    }

    // A glob that matches nothing looks like coverage and provides none. This
    // repo shipped `live: ["README.md"]`, which resolved under the docs root
    // and so matched no file at all, while reading as though the README were
    // covered.
    if (options.reportDeadGlobs) {
        for (const docClass of DOC_CLASSES) {
            for (const pattern of docs.globs[docClass]) {
                if (matchedGlobs.has(`${docClass}:${pattern}`)) {
                    continue;
                }
                diagnostics.push({
                    file,
                    keyPath: `docs.${docClass}`,
                    rule: "docs.deadGlob",
                    message:
                        `The \`${docClass}\` glob \`${pattern}\` matches no `
                        + "file.",
                    remedy:
                        "Remove it, or correct it. Globs resolve relative to "
                        + `the docs root (\`${docs.root}\`); prefix with \`/\` `
                        + "to match from the repo root instead.",
                    severity: "warning",
                });
            }
        }
    }

    return { files, diagnostics };
}

function withTrailingSlash(path: string): string {
    return path.endsWith("/") ? path : `${path}/`;
}

/**
 * Where an in-repo tracker may and may not sit.
 *
 * Both directions of the same rule. A tracker filed under another class is
 * validated as that class, so its ids, states and evidence lines go
 * unchecked. Another file filed as `tracker` is a second place task state can
 * live, which is what the doctrine forbids: with ClickUp that cannot happen,
 * and in-repo it has to be said.
 */
function checkTrackerPlacement(
    profile: Profile,
    path: string,
    docClass: DocClass,
    out: Diagnostic[],
): void {
    if (profile.tracker.backend !== "in-repo") {
        return;
    }
    const file = profile.sourcePath;

    if (docClass === "tracker" && path !== profile.tracker.file) {
        out.push({
            file,
            keyPath: "docs.tracker",
            rule: "docs.trackerAuthority",
            message: `\`${path}\` is classified as \`tracker\`, but the `
                + `tracker is \`${profile.tracker.file}\`.`,
            remedy: "Give it the class that fits what it holds. The tracker "
                + "file is the sole authority for task state, and a second "
                + "file carrying it means the answer to what is done depends "
                + "on which file a reader opens.",
            severity: "error",
        });
    }

    if (docClass !== "tracker" && path === profile.tracker.file) {
        out.push({
            file,
            keyPath: "docs.tracker",
            rule: "docs.trackerMisfiled",
            message: `The tracker file \`${path}\` is classified as `
                + `\`${docClass}\`, not \`tracker\`.`,
            remedy:
                "Move its glob to docs.tracker. Only that class checks task "
                + "ids, states, and the evidence line Done requires.",
            severity: "error",
        });
    }
}

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

    const docsPrefix = withTrailingSlash(docs.root);
    // The wiki has its own validator and its own rules. When it sits inside
    // the docs root, as it usually does, classifying its pages would demand a
    // doc class for every wiki page.
    const wikiPrefix = profile.wiki?.root
        ? withTrailingSlash(profile.wiki.root)
        : undefined;

    for (const path of repoRelativePaths) {
        if (!path.startsWith(docsPrefix)) {
            continue;
        }
        if (wikiPrefix !== undefined && path.startsWith(wikiPrefix)) {
            continue;
        }

        const relative = path.slice(docsPrefix.length);
        const matched = DOC_CLASSES.filter((docClass) =>
            docs.globs[docClass].some((pattern) =>
                new Bun.Glob(pattern).match(relative)
            )
        );

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

        // An in-repo tracker filed under another class would be validated as
        // that class, so its ids, states and evidence lines go unchecked.
        if (
            trackerIsInRepo && path === profile.tracker.file
            && docClass !== "tracker"
        ) {
            diagnostics.push({
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

    return { files, diagnostics };
}

function withTrailingSlash(path: string): string {
    return path.endsWith("/") ? path : `${path}/`;
}

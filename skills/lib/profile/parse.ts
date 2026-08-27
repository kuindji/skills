import {
    type Diagnostic,
    DOC_CLASSES,
    type DocClass,
    type Mode,
    type Owner,
    type PathCitations,
    type Profile,
    type TrackerBackend,
} from "./types";

const TRACKER_BACKENDS: TrackerBackend[] = [
    "clickup",
    "linear",
    "taskflow",
    "in-repo",
];
const PATH_CITATIONS: PathCitations[] = [ "forbidden", "citation" ];
const MODES: Mode[] = [ "greenfield", "mature" ];

const TOP_LEVEL_KEYS = new Set([
    "product",
    "paths",
    "wiki",
    "tracker",
    "taskflow",
    "house_rules",
    "generated_paths",
    "owners",
    "docs",
    "roadmap",
    "mode",
]);

/**
 * Keys that configure the repository rather than one product.
 *
 * A product profile that set these would be claiming authority over the whole
 * repo from inside one product's folder, which is how two products end up
 * disagreeing about where the wiki is.
 */
const ROOT_ONLY_KEYS = new Set([
    "wiki",
    "owners",
    "generated_paths",
    "house_rules",
    "taskflow",
]);

export interface ParseOptions {
    /**
     * Root profiles configure the repository and, in a single-product repo,
     * the product too. Product profiles configure one product and inherit the
     * rest, so they are not required to repeat repo-wide settings.
     */
    kind?: "root" | "product";
}

export interface ParseResult {
    /** Absent when the document could not be parsed at all. */
    profile?: Profile;
    diagnostics: Diagnostic[];
}

/**
 * Parse and validate a project-profile.yaml.
 *
 * Never throws. A profile is read from other people's repositories, so a
 * malformed document is a diagnostic like any other: the tool whose job is
 * reporting schema problems must not crash on one.
 */
export function parseProfile(
    source: string,
    file: string,
    options: ParseOptions = {},
): ParseResult {
    const kind = options.kind ?? "root";
    const diagnostics: Diagnostic[] = [];
    const at = lineFinder(source);

    // Report against the key rather than the value, so the caller sees the
    // setting that is wrong rather than the text that happens to be there.
    const add = (
        keyPath: string,
        rule: string,
        message: string,
        remedy: string,
        severity: Diagnostic["severity"] = "error",
    ) => {
        diagnostics.push({
            file,
            keyPath,
            line: at(keyPath),
            rule,
            message,
            remedy,
            severity,
        });
    };

    let raw: unknown;
    try {
        raw = Bun.YAML.parse(source);
    }
    catch (error) {
        diagnostics.push({
            file,
            keyPath: "",
            rule: "schema.parse",
            message: `The file is not valid YAML: ${errorText(error)}`,
            remedy: "Fix the YAML syntax, then run profile-validate again.",
            severity: "error",
        });
        return { diagnostics };
    }

    if (!isRecord(raw)) {
        diagnostics.push({
            file,
            keyPath: "",
            rule: "schema.parse",
            message: "The file does not contain a YAML mapping.",
            remedy:
                "A profile is a mapping of settings, for example `tracker:` "
                + "followed by an indented `backend:`.",
            severity: "error",
        });
        return { diagnostics };
    }

    // An unknown key is almost always a typo in a key that matters, so it is
    // reported rather than ignored. Silently dropping `wikki:` would leave a
    // repo believing it had configured a wiki it had not.
    for (const key of Object.keys(raw)) {
        if (kind === "product" && ROOT_ONLY_KEYS.has(key)) {
            add(
                key,
                "schema.rootOnlyKey",
                `\`${key}\` configures the whole repository, but this is a `
                    + "product profile.",
                `Move \`${key}\` to the root project-profile.yaml. A product `
                    + "profile carries only what differs per product: docs, "
                    + "mode, roadmap, paths and tracker.project.",
            );
            continue;
        }
        if (!TOP_LEVEL_KEYS.has(key)) {
            add(
                key,
                "schema.unknownKey",
                `Unknown setting \`${key}\`.`,
                `Remove it, or correct it to one of: ${
                    [ ...TOP_LEVEL_KEYS ].sort().join(", ")
                }.`,
            );
        }
    }

    const profile: Profile = {
        sourcePath: file,
        product: optionalString(raw.product),
        paths: stringList(raw.paths),
        tracker: { backend: "in-repo" },
        taskflow: { enabled: false },
        houseRules: optionalString(raw.house_rules),
        generatedPaths: stringList(raw.generated_paths),
        owners: [],
        mode: { default: "greenfield", overrides: {} },
        roadmap: optionalString(raw.roadmap),
    };

    // --- tracker -----------------------------------------------------------
    const tracker = isRecord(raw.tracker) ? raw.tracker : {};
    const backend = optionalString(tracker.backend);
    if (backend === undefined) {
        // A product profile inherits the backend from the root profile. Only
        // the root has to say where issue state lives.
        if (kind === "root") {
            add(
                "tracker.backend",
                "tracker.backend",
                "No tracker backend is set.",
                `Set tracker.backend to one of: ${
                    TRACKER_BACKENDS.join(", ")
                }.`,
            );
        }
    }
    else if (!TRACKER_BACKENDS.includes(backend as TrackerBackend)) {
        add(
            "tracker.backend",
            "tracker.backend",
            `\`${backend}\` is not a tracker backend this system knows.`,
            `Use one of: ${TRACKER_BACKENDS.join(", ")}.`,
        );
    }
    else {
        profile.tracker.backend = backend as TrackerBackend;
    }
    profile.tracker.project = optionalString(tracker.project);
    profile.tracker.file = optionalString(tracker.file);

    // An in-repo tracker with no file has no authority to point at, which
    // would leave task state with nowhere legal to live.
    if (
        kind === "root" && backend === "in-repo" && !profile.tracker.file
    ) {
        add(
            "tracker.backend",
            "tracker.file",
            "An in-repo tracker does not name the file that holds task state.",
            "Set tracker.file to the markdown file that is the tracker, for "
                + "example `docs/tasks.md`.",
        );
    }

    // --- taskflow ----------------------------------------------------------
    const taskflow = isRecord(raw.taskflow) ? raw.taskflow : {};
    profile.taskflow.enabled = taskflow.enabled === true;

    // --- wiki --------------------------------------------------------------
    if (raw.wiki !== undefined) {
        const wiki = isRecord(raw.wiki) ? raw.wiki : {};
        const root = optionalString(wiki.root);
        if (!root) {
            add(
                "wiki.root",
                "wiki.root",
                "A wiki is declared but has no root directory.",
                "Set wiki.root to the directory holding the wiki, for example "
                    + "`docs/wiki`. The directory may be empty.",
            );
        }
        const citations = optionalString(wiki.path_citations) ?? "citation";
        if (!PATH_CITATIONS.includes(citations as PathCitations)) {
            add(
                "wiki.path_citations",
                "wiki.path_citations",
                `\`${citations}\` is not a path-citation policy.`,
                "Use `forbidden` to reject file paths in wiki prose, or "
                    + "`citation` to allow them and report their count. There "
                    + "is deliberately no off switch.",
            );
        }
        profile.wiki = {
            root: root ?? "",
            profiles: stringList(wiki.profiles),
            businessSubtree: optionalString(wiki.business_subtree),
            pathCitations: PATH_CITATIONS.includes(citations as PathCitations)
                ? citations as PathCitations
                : "citation",
        };
    }

    // --- docs --------------------------------------------------------------
    if (raw.docs !== undefined) {
        const docs = isRecord(raw.docs) ? raw.docs : {};
        const globs = {} as Record<DocClass, string[]>;
        for (const cls of DOC_CLASSES) {
            globs[cls] = stringList(docs[cls]);
        }
        profile.docs = {
            root: optionalString(docs.root) ?? "docs",
            globs,
            staleAfterDays: optionalNumber(docs.stale_after_days) ?? 30,
            reviewAfterDays: optionalNumber(docs.review_after_days) ?? 90,
        };
    }

    // --- owners ------------------------------------------------------------
    if (raw.owners !== undefined) {
        profile.owners = readOwners(raw.owners, add);
    }

    // --- mode --------------------------------------------------------------
    if (raw.mode !== undefined) {
        const mode = isRecord(raw.mode) ? raw.mode : {};
        const fallback = optionalString(mode.default) ?? "greenfield";
        if (!MODES.includes(fallback as Mode)) {
            add(
                "mode.default",
                "mode.default",
                `\`${fallback}\` is not a mode.`,
                `Use one of: ${MODES.join(", ")}.`,
            );
        }
        else {
            profile.mode.default = fallback as Mode;
        }
        const overrides = isRecord(mode.overrides) ? mode.overrides : {};
        for (const [ path, value ] of Object.entries(overrides)) {
            const asMode = optionalString(value);
            if (asMode && MODES.includes(asMode as Mode)) {
                profile.mode.overrides[path] = asMode as Mode;
            }
            else {
                add(
                    `mode.overrides.${path}`,
                    "mode.overrides",
                    `\`${String(value)}\` is not a mode for path \`${path}\`.`,
                    `Use one of: ${MODES.join(", ")}.`,
                );
            }
        }
    }

    const errored = diagnostics.some((d) => d.severity === "error");
    return errored ? { diagnostics } : { profile, diagnostics };
}

/**
 * Read the owners map.
 *
 * Ownership answers "may this clone write here", which is a different question
 * from "which product is this", so it is validated on its own terms: exactly
 * one owner may claim the leftovers, and two explicit owners may not claim the
 * same path.
 */
function readOwners(
    value: unknown,
    add: (
        keyPath: string,
        rule: string,
        message: string,
        remedy: string,
    ) => void,
): Owner[] {
    if (!isRecord(value)) {
        add(
            "owners",
            "owners.shape",
            "`owners` is not a mapping of owner name to settings.",
            "Write each owner as a key with `paths:` beneath it.",
        );
        return [];
    }

    const owners: Owner[] = [];
    for (const [ name, config ] of Object.entries(value)) {
        const record = isRecord(config) ? config : {};
        owners.push({
            name,
            paths: stringList(record.paths),
            shared: record.shared === true,
            isDefault: record.default === true,
        });
    }

    const defaults = owners.filter((o) => o.isDefault);
    if (defaults.length > 1) {
        add(
            "owners",
            "owners.default",
            `More than one owner claims the default: ${
                defaults.map((o) => o.name).join(", ")
            }.`,
            "Only one owner may set `default: true`. It claims every path no "
                + "explicit owner matched, so a second one has nothing left to "
                + "claim.",
        );
    }

    // The default owner is excluded: it claims leftovers by definition, so it
    // cannot conflict with an explicit claim.
    const explicit = owners.filter((o) => !o.isDefault);
    const seen = new Map<string, string>();
    for (const owner of explicit) {
        for (const path of owner.paths) {
            const previous = seen.get(path);
            if (previous !== undefined) {
                add(
                    "owners",
                    "owners.overlap",
                    `\`${path}\` is claimed by both \`${previous}\` and `
                        + `\`${owner.name}\`.`,
                    "Ownership must partition the repo. Give the path to one "
                        + "owner, or move the shared part into its own path "
                        + "owned by the shared owner.",
                );
            }
            else {
                seen.set(path, owner.name);
            }
        }
    }

    return owners;
}

/**
 * Best-effort line lookup for a dotted key path.
 *
 * A validator that reports only "invalid profile" sends the reader hunting, so
 * diagnostics carry a line. Bun.YAML returns plain values with no position
 * information, so the line is recovered by walking the source for each key
 * segment in order, tracking indentation to avoid matching a same-named key
 * under a different parent.
 */
function lineFinder(source: string): (keyPath: string) => number | undefined {
    const lines = source.split("\n");

    return (keyPath) => {
        if (!keyPath) {
            return undefined;
        }
        const segments = keyPath.split(".");
        let from = 0;
        let parentIndent = -1;
        let found: number | undefined;

        for (const segment of segments) {
            found = undefined;
            for (let i = from; i < lines.length; i++) {
                const line = lines[i] ?? "";
                const match = /^(\s*)([A-Za-z0-9_"'-]+)\s*:/.exec(line);
                if (!match) {
                    continue;
                }
                const indent = (match[1] ?? "").length;
                const key = (match[2] ?? "").replace(/^["']|["']$/g, "");
                // Dedenting past the parent means this branch is over.
                if (indent <= parentIndent && found === undefined && i > from) {
                    break;
                }
                if (key === segment && indent > parentIndent) {
                    found = i + 1;
                    from = i + 1;
                    parentIndent = indent;
                    break;
                }
            }
            if (found === undefined) {
                return undefined;
            }
        }
        return found;
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
}

/** Coerce a YAML list to strings, dropping anything that is not one. */
function stringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item): item is string => typeof item === "string");
}

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

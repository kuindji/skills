import { patternsCollide } from "./paths";
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
    "todo-tray",
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
    /**
     * Repo-wide settings a product profile inherits from the root.
     *
     * Inheriting has to happen here rather than being left to a caller,
     * because the parsed shape cannot say whether a value was declared or
     * defaulted. Without it, a product under a Linear tracker parsed as
     * `in-repo` — the default — and every rule that asks where task state
     * lives got the wrong answer for that product, silently.
     */
    inherit?: { trackerBackend?: TrackerBackend; trackerFile?: string; };
    /**
     * Whether this profile represents a product that must name its board or
     * list. The loader decides this after it knows whether the root is the
     * sole product or a repository-level profile above product profiles.
     */
    requireTrackerProject?: boolean;
    /**
     * Whether the repository declares a tracker at all.
     *
     * A product names its board in `tracker.project`, and the backend that board
     * lives in is the root's. Where the root declares no tracker, a product
     * naming one is pointing at a system this repository does not use, and
     * nothing downstream would ever read it. The loader knows the root's answer
     * and a product profile cannot, which is why this arrives as an option.
     */
    rootDeclaresTracker?: boolean;
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
        // No backend until one is declared. Defaulting to in-repo here would
        // make a repository that named no tracker indistinguishable from one
        // that named a file, and every in-repo rule would then run over a file
        // that does not exist.
        tracker: {},
        taskflow: { enabled: false },
        houseRules: optionalString(raw.house_rules),
        generatedPaths: stringList(raw.generated_paths),
        owners: [],
        mode: { default: "greenfield", overrides: {} },
        roadmap: optionalString(raw.roadmap),
    };

    // --- tracker -----------------------------------------------------------
    // Three shapes, three answers. Collapsing them is what made a repository
    // that tracks nothing impossible to express: absence is a configuration,
    // and a block half written is a mistake, and they are not the same thing.
    const declaresTracker = Object.hasOwn(raw, "tracker");
    const tracker = isRecord(raw.tracker) ? raw.tracker : {};
    if (declaresTracker && !isRecord(raw.tracker)) {
        add(
            "tracker",
            "tracker.shape",
            "`tracker` is declared but is not a mapping.",
            "Give it a `backend`, or remove the key. A repository that tracks "
                + "nothing leaves `tracker` out entirely, which is a "
                + "configuration rather than a gap.",
        );
    }
    const backend = optionalString(tracker.backend);
    const inheritedBackend = options.inherit?.trackerBackend;
    if (inheritedBackend !== undefined) {
        profile.tracker.backend = inheritedBackend;
    }
    if (backend === undefined) {
        // A product profile inherits the backend from the root profile. Only
        // the root has to say where issue state lives, and only if it says
        // that task state lives anywhere at all.
        if (kind === "root" && isRecord(raw.tracker)) {
            add(
                "tracker.backend",
                "tracker.backend",
                "`tracker` is declared but names no backend.",
                `Set tracker.backend to one of: ${
                    TRACKER_BACKENDS.join(", ")
                }. To declare that this repository tracks nothing, remove the `
                    + "`tracker` block instead of leaving it empty.",
            );
        }
    }
    else if (kind === "product") {
        // Where task state lives is a property of the repository, not of one
        // product in it. Two products disagreeing about it would each be
        // right about their own docs and wrong about the repo they share.
        add(
            "tracker.backend",
            "tracker.rootOnlyBackend",
            "`tracker.backend` configures the whole repository, but this is a "
                + "product profile.",
            "Move it to the root project-profile.yaml. A product profile "
                + "carries `tracker.project`, which is the board or list this "
                + "product's tasks live in.",
        );
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
    // The file is repo-wide, so a product reads the root's rather than its
    // own. Every skill starts by resolving the profile that governs a path,
    // and under a product profile that resolution has to answer where the
    // tracker is.
    profile.tracker.file = optionalString(tracker.file)
        ?? options.inherit?.trackerFile;

    // The tracker file is repo-wide for the same reason the backend is, and
    // everything that reads it reads the root profile's. Accepted here it
    // would be a key somebody set, believed, and nothing ever acted on.
    if (kind === "product" && optionalString(tracker.file) !== undefined) {
        add(
            "tracker.file",
            "tracker.rootOnlyFile",
            "`tracker.file` names the repository's tracker, but this is a "
                + "product profile.",
            "Move it to the root project-profile.yaml. One file holds task "
                + "state for the whole repository, and a product's docs root "
                + "can hold it: classification reads the root profile's path "
                + "either way. A product profile carries `tracker.project`.",
        );
    }

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

    // todo-tray needs the project code for the same reason ClickUp and Linear
    // need the board: `todo-tray task list --project <code>` is how the work
    // already recorded is found, and there is no default.
    if (
        options.requireTrackerProject === true
        && (profile.tracker.backend === "clickup"
            || profile.tracker.backend === "linear"
            || profile.tracker.backend === "todo-tray")
        && !profile.tracker.project
    ) {
        add(
            "tracker.backend",
            "tracker.project",
            `The ${profile.tracker.backend} tracker does not name the board `
                + "or list that holds this product's tasks.",
            "Set tracker.project to the ClickUp list URL, the Linear team or "
                + "project, or the todo-tray project code used for this "
                + "product.",
        );
    }

    // A product naming a board under a repository that tracks nothing is
    // naming a destination in a system nothing here uses. Silently accepted it
    // is a key somebody set and believed, which is the fault the root-only
    // rules above exist to prevent.
    if (
        options.rootDeclaresTracker === false
        && profile.tracker.project !== undefined
    ) {
        add(
            "tracker.project",
            "tracker.projectWithoutTracker",
            "`tracker.project` names a board, but the root profile declares no "
                + "tracker.",
            "Remove it, or declare `tracker.backend` in the root "
                + "project-profile.yaml. Where the repository tracks nothing, "
                + "there is no system for this board to live in.",
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
            root: trimSlashes(root ?? ""),
            profiles: stringList(wiki.profiles),
            businessSubtree: optionalString(
                trimSlashes(optionalString(wiki.business_subtree)),
            ),
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
        const root = normaliseDocsRoot(docs.root);
        if (kind === "product" && root === "") {
            const directory = file.includes("/")
                ? file.slice(0, file.lastIndexOf("/"))
                : "";
            add(
                "docs.root",
                "docs.root",
                "This product profile names the repository root as its docs "
                    + "root.",
                "`docs.root` is relative to the repository, not to this file. "
                    + (directory === ""
                        ? "Name the directory holding this product's documents."
                        : `Write \`root: ${directory}\`, the directory this `
                            + "profile sits in.")
                    + " A product owns a subtree, so a docs root at the "
                    + "repository root would demand a class from this product "
                    + "for every file in the repository.",
            );
        }
        profile.docs = {
            root,
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
    // Two claims overlap when they could ever name the same file, not when
    // they are spelled the same way. `packages` and `packages/ui` partition
    // nothing, and comparing the strings reported them as disjoint. This is
    // the same standard the product path index already holds `paths` to.
    const seen: { path: string; owner: string; }[] = [];
    for (const owner of explicit) {
        for (const path of owner.paths) {
            const previous = seen.find((claim) =>
                claim.owner !== owner.name && patternsCollide(claim.path, path)
            );
            if (previous !== undefined) {
                add(
                    "owners",
                    "owners.overlap",
                    `\`${path}\` is claimed by both \`${previous.owner}\` and `
                        + `\`${owner.name}\`.`,
                    "Ownership must partition the repo. Give the path to one "
                        + "owner, or move the shared part into its own path "
                        + "owned by the shared owner.",
                );
            }
            else {
                seen.push({ path, owner: owner.name });
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

/**
 * Strip trailing slashes from a directory setting.
 *
 * Every rule that reads one of these compares it as a path prefix, and
 * `business/` never prefixes `business/orders`. Written with the slash the
 * setting reads correctly to a person and silently switches its rule off, so
 * the shape is settled here rather than defended at each use.
 */
/**
 * The docs root as a repo-relative prefix.
 *
 * Every spelling of the repository root normalises to the empty string. They
 * used to normalise to themselves, and nothing starts with `./` or with `/`,
 * so a profile written that way classified no file at all while reading as
 * fully configured: found by copying the product-profile template, whose
 * `root: .` came from the design spec, into a scratch repository, where the
 * documents it owned were reported as unclassified by the profile above it.
 *
 * Repo-relative includes a product profile sitting at the directory it means.
 * There is no notion of the file's own position here, and giving `.` that
 * reading would make one key mean two things depending on which file it is in.
 */
function normaliseDocsRoot(value: unknown): string {
    const given = optionalString(value);
    if (given === undefined) {
        return "docs";
    }
    return trimSlashes(given.replace(/^\.\//, "").replace(/^\/+/, ""))
        .replace(/^\.$/, "");
}

function trimSlashes<T extends string | undefined>(value: T): T {
    return (typeof value === "string"
        ? value.replace(/\/+$/, "")
        : value) as T;
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

/**
 * Whether a document configures a repository rather than a product.
 *
 * Discovery finds profiles by filename, and a repository can hold profiles
 * that are not its own: test corpora like this repo's fixtures, a vendored
 * copy, a sample project. A nested document declaring repo-wide settings and
 * naming no product is claiming a repository, so it marks a boundary rather
 * than a product.
 *
 * Both halves are load-bearing. The repo-wide keys are the same ones a product
 * profile is refused for carrying, which keeps the two rules from drifting
 * apart. And a document naming a product is never a boundary, however it is
 * written: skipping it would turn a `wiki:` typed into the wrong profile from
 * a reported error into silence, and a silent skip is the one outcome a
 * misconfigured profile must not get.
 *
 * Unreadable YAML is not a boundary either. The file is then parsed as a
 * product profile and reports its syntax error there.
 */
export function looksLikeRepositoryRoot(source: string): boolean {
    let raw: unknown;
    try {
        raw = Bun.YAML.parse(source);
    }
    catch {
        return false;
    }
    if (!isRecord(raw)) {
        return false;
    }
    if (typeof raw.product === "string" && raw.product.trim() !== "") {
        return false;
    }
    if (Object.keys(raw).some((key) => ROOT_ONLY_KEYS.has(key))) {
        return true;
    }
    // `tracker.backend` is repo-wide too, and it is the only repo-wide setting
    // that lives under a key a product profile may also use. A nested repo
    // declaring nothing but a tracker and its docs would otherwise be adopted
    // as a product of this one.
    if (isRecord(raw.tracker) && typeof raw.tracker.backend === "string") {
        return true;
    }

    // Since a repository may declare no tracker at all, the check above no
    // longer catches every nested root: one carrying only `docs` and `mode` has
    // nothing repo-wide left to recognise it by. What still separates the two
    // is what the document claims. `paths`, `roadmap` and `tracker.project` are
    // a product's own settings, and a document carrying any of them is claiming
    // to be a product however badly it is written. An unnamed one is then a
    // fault worth reporting as `products.unnamed`, and swallowing it here as a
    // boundary would be exactly the silent skip this function must not perform.
    const claimsToBeAProduct = Object.hasOwn(raw, "paths")
        || Object.hasOwn(raw, "roadmap")
        || (isRecord(raw.tracker) && Object.hasOwn(raw.tracker, "project"));
    if (claimsToBeAProduct) {
        return false;
    }

    return Object.hasOwn(raw, "docs")
        || Object.hasOwn(raw, "mode")
        || Object.hasOwn(raw, "tracker");
}

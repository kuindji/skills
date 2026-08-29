/**
 * Shape of a project-profile.yaml after parsing and validation.
 *
 * A profile binds the universal rules in the skills to one repository: where
 * its wiki lives, which docs are under lifecycle control, who may write where,
 * and whether a given path is greenfield or mature. Every skill reads its
 * project-specific answers from here rather than from prose.
 */

/** How a project treats file-path citations in wiki prose. */
export type PathCitations = "forbidden" | "citation";

/** Development mode for a path. Gates ceremony, not correctness. */
export type Mode = "greenfield" | "mature";

/**
 * Where issue state lives. "in-repo" means a markdown file in this repo.
 *
 * Taskflow is deliberately not here. It is a consumer of this package and a
 * local session tool: it holds the session, its worktree and its log, and no
 * issue state. Its axis is the `taskflow` block, which is a different question.
 */
export type TrackerBackend =
    | "clickup"
    | "linear"
    | "todo-tray"
    | "in-repo";

/** The doc classes a file under the docs root can belong to. */
export const DOC_CLASSES = [
    "lifecycle",
    "live",
    "tracker",
    "checklists",
    "reference",
    "assets",
    "ignored",
] as const;

export type DocClass = (typeof DOC_CLASSES)[number];

export interface WikiConfig {
    /** Repo-relative directory holding the wiki. May be empty on a new repo. */
    root: string;
    /** Which style profiles this wiki runs, e.g. ["business", "technical"]. */
    profiles: string[];
    /** Optional self-contained subtree, relative to root. */
    businessSubtree?: string;
    /** The one rule whose policy a project chooses. */
    pathCitations: PathCitations;
}

export interface TrackerConfig {
    /**
     * Absent when the repository declares no tracker at all, which is a
     * configuration rather than a gap: nothing then answers what is intended or
     * whether it is done, and no tracking rule fires.
     */
    backend?: TrackerBackend;
    /** Project or board name inside an external tracker. */
    project?: string;
    /** Repo-relative markdown file. Required when backend is "in-repo". */
    file?: string;
}

export interface DocsConfig {
    /** Repo-relative directory. Every file under it must match one class. */
    root: string;
    /** Glob patterns per class, relative to root. */
    globs: Record<DocClass, string[]>;
    /** An "active" lifecycle doc untouched this long is flagged. */
    staleAfterDays: number;
    /** A "live" doc untouched this long is flagged for review. */
    reviewAfterDays: number;
}

export interface Owner {
    /** Key from the owners map. Matches the clone directory name. */
    name: string;
    paths: string[];
    /** A shared owner's changes require a consumer blast-radius check. */
    shared: boolean;
    /** Claims every path no explicit owner matched. At most one. */
    isDefault: boolean;
}

export interface ModeConfig {
    default: Mode;
    /** Path prefix to mode. Longest matching prefix wins. */
    overrides: Record<string, Mode>;
}

export interface Profile {
    /** Absolute path to the file this was parsed from. */
    sourcePath: string;
    /** Product name. Absent on a root profile that declares no product. */
    product?: string;
    /** Code paths this product owns. Empty on a root-only profile. */
    paths: string[];
    wiki?: WikiConfig;
    tracker: TrackerConfig;
    taskflow: { enabled: boolean; };
    houseRules?: string;
    generatedPaths: string[];
    owners: Owner[];
    docs?: DocsConfig;
    /** Release sequence doc. Absent when the product ships continuously. */
    roadmap?: string;
    mode: ModeConfig;
}

/**
 * One problem found in a profile.
 *
 * `keyPath` is the YAML key that is wrong ("docs.lifecycle[0]"), and `line` is
 * a best-effort lookup of where that key appears in the source. Both are
 * present so a reader can act without opening a schema reference: the rule
 * names what was violated, the remedy names what to do about it.
 */
export interface Diagnostic {
    file: string;
    keyPath: string;
    line?: number;
    rule: string;
    message: string;
    remedy: string;
    severity: "error" | "warning";
}

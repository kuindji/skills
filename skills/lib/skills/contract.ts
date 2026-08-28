import { duplicateKeys, parseFrontmatter } from "../markdown/frontmatter";
import type { Diagnostic } from "../profile/types";
import { bodyLines } from "../wiki/page";

/**
 * The contract a SKILL.md is held to.
 *
 * A skill is read by several agents, and every one of them fails differently
 * when the file is wrong. A malformed frontmatter block does not announce
 * itself: the skill is simply never offered, and the agent does the work the
 * way it would have without it. So the checks here are the ones whose failure
 * is otherwise silent, and nothing else.
 *
 * They are not a bin. Consuming repositories have no `skills/` directory, so
 * this is a rule about this repository's own product rather than one the
 * umbrella can carry to anyone else.
 */

/**
 * The specification's limit on the description.
 *
 * On the description alone, not on the block. Measured against the 395
 * SKILL.md files installed on this machine, reading it as the block fails 43
 * of them: shipped skills carrying `metadata` and `hooks` alongside
 * descriptions of 836, 908 and 1013 characters. A rule that fails working
 * skills is a rule somebody switches off.
 */
export const MAX_DESCRIPTION_CHARS = 1024;

/** A skill's name is its directory name, and a path segment besides. */
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Inline code spans, which is where a command an agent runs is written. */
const CODE_SPAN_RE = /`+([^`]+)`+/g;

/**
 * A token shaped like one of this package's bins.
 *
 * A closed set of suffixes rather than an open guess at what looks like a
 * command. The failure being caught is a skill naming a bin that does not
 * exist, which an agent discovers as a command-not-found in the middle of the
 * procedure the skill exists to give it.
 *
 * Closed means every bin this package gains has to be added here. A suffix
 * missing from the set is a bin no skill is checked against, and that failure
 * arrives silently.
 */
const BIN_LIKE_RE = /\b[a-z][a-z0-9-]*-(?:validate|freeze|generated|drift)\b/g;

/** `[text](target)`, with the target captured. */
const LINK_RE = /\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * `[label]: target`, the other half of Markdown's link syntax.
 *
 * Checked because a skill that links out instead of restating has no content
 * left when a link dies, and which of the two spellings it used is not
 * something the reader chose.
 *
 * The label carries no whitespace, which is what separates a definition from
 * a TypeScript index signature. `[x: string]: any` is the same shape, it sits
 * in prose whenever a fence is left unclosed, and across the SKILL.md files
 * on this machine it is most of what the looser form reported.
 */
const LINK_DEF_RE = /^ {0,3}\[[^\]\s]+\]:\s*(\S+)/;

export interface Skill {
    /** Repo-relative path to the SKILL.md itself. */
    path: string;
    /** Repo-relative directory holding it. */
    directory: string;
    frontmatter: Record<string, unknown>;
    /** Whether a delimited block was present at all. */
    hasFrontmatter: boolean;
    /** The raw YAML, so a block that failed to parse can be told apart. */
    block: string;
    /** The block held something and did not parse, so it carries no keys. */
    malformed: boolean;
    /** 1-based line of each frontmatter key, so diagnostics carry a line. */
    frontmatterLines: Record<string, number>;
    body: string;
    bodyStartLine: number;
}

export interface SkillContext {
    /** The skill directory's basename, which the `name` key must match. */
    directory: string;
    /** Filenames directly inside the skill directory. */
    entries: string[];
    /** Bin names `package.json` declares. */
    bins: string[];
}

/** Split a SKILL.md into the pieces the rules read. Never throws. */
export function parseSkill(source: string, path: string): Skill {
    const { values, block, body, bodyStartLine, lines, present, malformed } =
        parseFrontmatter(source);
    return {
        path,
        directory: path.replace(/\/[^/]*$/, ""),
        frontmatter: values,
        hasFrontmatter: present,
        block,
        malformed,
        frontmatterLines: lines,
        body,
        bodyStartLine,
    };
}

/** Everything checkable without reading another file. */
export function checkSkill(skill: Skill, context: SkillContext): Diagnostic[] {
    const out: Diagnostic[] = [];
    checkFrontmatter(skill, context, out);
    checkDirectory(skill, context, out);
    checkBins(skill, context, out);
    return out;
}

/**
 * Every relative link resolves, heading and all.
 *
 * A skill's whole design is to link to doctrine rather than restate it, which
 * makes a dead link the failure that empties the skill of its content. The
 * reader is an agent that will not go looking for where the section moved to.
 *
 * `read` returns a file's text, or undefined when it is not there, which is
 * what keeps this testable against literals instead of a fixture tree.
 */
export async function checkSkillLinks(
    skill: Skill,
    read: (repoRelativePath: string) => Promise<string | undefined>,
): Promise<Diagnostic[]> {
    const out: Diagnostic[] = [];
    const headings = new Map<string, Set<string> | undefined>();

    for (const { line, text, prose } of bodyLines(skill)) {
        const definition = LINK_DEF_RE.exec(text)?.[1];
        const targets = [
            ...[ ...prose.matchAll(LINK_RE) ].map((match) => match[1] ?? ""),
            ...definition === undefined ? [] : [ definition ],
        ];

        for (const target of targets) {
            // An absolute URL is somebody else's document. Fetching it to
            // check a fragment would make a validator that needs the network
            // to answer.
            if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
                continue;
            }
            const [ rawPath, anchor ] = splitAnchor(target);

            // A bare anchor points into this file, which is the one file the
            // reader is already holding. It still has to resolve: a heading
            // gets renamed without the links to it being touched.
            if (rawPath === "") {
                if (
                    anchor !== undefined
                    && !headingSlugs(skill.body).has(anchor)
                ) {
                    out.push({
                        file: skill.path,
                        keyPath: "",
                        line,
                        rule: "skill.deadLink",
                        message: `This file has no heading \`#${anchor}\`.`,
                        remedy: "Point at a heading that is there, or drop the "
                            + "link.",
                        severity: "error",
                    });
                }
                continue;
            }

            const path = resolvePath(skill.directory, rawPath);
            if (path === undefined) {
                out.push({
                    file: skill.path,
                    keyPath: "",
                    line,
                    rule: "skill.deadLink",
                    message: `The link to \`${rawPath}\` climbs out of the `
                        + "repository.",
                    remedy:
                        "Point at something inside it. Popped past the root, "
                        + "the remaining segments read as a path from the root "
                        + "again, so the link resolves against a file it was "
                        + "never aimed at.",
                    severity: "error",
                });
                continue;
            }

            if (!headings.has(path)) {
                const source = await read(path);
                headings.set(
                    path,
                    source === undefined ? undefined : headingSlugs(source),
                );
            }
            const found = headings.get(path);

            if (found === undefined) {
                out.push({
                    file: skill.path,
                    keyPath: "",
                    line,
                    rule: "skill.deadLink",
                    message: `The link to \`${path}\` points at no file.`,
                    remedy:
                        "Correct the path or drop the link. A skill links out "
                        + "instead of restating, so a link that does not "
                        + "resolve takes the rule with it.",
                    severity: "error",
                });
                continue;
            }
            if (anchor !== undefined && !found.has(anchor)) {
                out.push({
                    file: skill.path,
                    keyPath: "",
                    line,
                    rule: "skill.deadLink",
                    message: `\`${path}\` has no heading \`#${anchor}\`.`,
                    remedy: "Point at a heading that is there. A heading is a "
                        + "name, so it survives being moved within the file "
                        + "and changes loudly when it is renamed.",
                    severity: "error",
                });
            }
        }
    }

    return out;
}

function checkFrontmatter(
    skill: Skill,
    context: SkillContext,
    out: Diagnostic[],
): void {
    const at = (key: string) => skill.frontmatterLines[key];

    // One diagnostic for an absent block, rather than one per missing key. A
    // file with no frontmatter has one fault, and listing its keys would bury
    // it under consequences.
    if (!skill.hasFrontmatter) {
        out.push({
            file: skill.path,
            keyPath: "",
            line: 1,
            rule: "skill.frontmatterShape",
            message: "The file has no frontmatter block.",
            remedy:
                "Open the file with `---`, `name:`, `description:` and `---`. "
                + "Without it the skill is not a skill: it is never offered, "
                + "and the agent works as though it did not exist.",
            severity: "error",
        });
        return;
    }

    for (const { key, line } of duplicateKeys(skill.block)) {
        out.push({
            file: skill.path,
            keyPath: key,
            line,
            rule: "skill.frontmatterShape",
            message: `\`${key}\` is declared twice.`,
            remedy:
                "Delete one. YAML keeps the last of two, silently, so the file "
                + "says one thing to a reader scanning from the top and "
                + "another to the loader.",
            severity: "error",
        });
    }

    // A block that is there and parsed to nothing did not parse. Reporting
    // its keys as absent sends the reader looking for keys that are visibly
    // on the page, which is the failure mode the house rule on diagnostics
    // exists to prevent. The parser answers it, so the same predicate is not
    // written out a third time here.
    if (skill.malformed) {
        out.push({
            file: skill.path,
            keyPath: "",
            line: 1,
            rule: "skill.frontmatterShape",
            message:
                "The frontmatter block did not parse as a mapping, so nothing "
                + "in it can be read.",
            remedy: "The block has to be `key: value` lines carrying `name` "
                + "and `description`. The usual cause is a value holding a "
                + "colon, which a description does by default: quote the "
                + "whole value, or rewrite it without the colon.",
            severity: "error",
        });
        return;
    }

    const name = skill.frontmatter["name"];
    if (name !== context.directory) {
        out.push({
            file: skill.path,
            keyPath: "name",
            line: at("name"),
            rule: "skill.frontmatterShape",
            message: `\`name\` is \`${describe(name)}\` and the directory is `
                + `\`${context.directory}\`.`,
            remedy: `Set \`name: ${context.directory}\`. A harness addresses `
                + "the skill by one and finds it by the other, so a "
                + "disagreement makes it unreachable from whichever side is "
                + "wrong.",
            severity: "error",
        });
    }
    else if (!NAME_RE.test(context.directory)) {
        out.push({
            file: skill.path,
            keyPath: "name",
            line: at("name"),
            rule: "skill.frontmatterShape",
            message: `\`${context.directory}\` is not a usable skill name.`,
            remedy:
                "Use lowercase letters, digits and single hyphens. The name is "
                + "a directory and an identifier at once, and anything else is "
                + "quoted differently by every harness that reads it.",
            severity: "error",
        });
    }

    const description = skill.frontmatter["description"];
    if (
        typeof description === "string"
        && description.length > MAX_DESCRIPTION_CHARS
    ) {
        out.push({
            file: skill.path,
            keyPath: "description",
            line: at("description"),
            rule: "skill.descriptionSize",
            message: `\`description\` is ${description.length} characters, `
                + `over the ${MAX_DESCRIPTION_CHARS}-character limit.`,
            remedy:
                "Cut it back to the conditions that should trigger the skill. "
                + "What the skill does belongs in the body, which is read only "
                + "once the description has already decided the skill applies.",
            severity: "error",
        });
    }
    else if (typeof description !== "string" || description.trim() === "") {
        out.push({
            file: skill.path,
            keyPath: "description",
            line: at("description"),
            rule: "skill.frontmatterShape",
            message: "`description` must be a non-empty string, and is "
                + `\`${describe(description)}\`.`,
            remedy:
                "Say when the skill applies, in the third person, naming the "
                + "situations that should trigger it. It is the only part of "
                + "the file an agent reads before deciding whether to read the "
                + "rest.",
            severity: "error",
        });
    }
}

/**
 * A skill directory holds SKILL.md and nothing else.
 *
 * The house rule, and the reason for it is mechanical: a harness scanning for
 * skills reads directories, so a script sitting beside one is either mistaken
 * for a skill or reachable only from a skill-aware harness. Executables live
 * in `skills/bin/` where CI and every agent can run them.
 */
function checkDirectory(
    skill: Skill,
    context: SkillContext,
    out: Diagnostic[],
): void {
    const extra = context.entries.filter((entry) => entry !== "SKILL.md")
        .sort();
    if (extra.length === 0) {
        return;
    }
    out.push({
        file: skill.path,
        keyPath: "",
        rule: "skill.directoryContents",
        message: `The skill directory also holds ${extra.join(", ")}.`,
        remedy: "Move implementation to `skills/lib/`, an entry point to "
            + "`skills/bin/` declared in `package.json`, and shared prose to "
            + "`skills/doctrine.md`. A script beside a skill runs only under a "
            + "harness that knows what a skill is.",
        severity: "error",
    });
}

/** A command the skill tells an agent to run has to exist. */
function checkBins(
    skill: Skill,
    context: SkillContext,
    out: Diagnostic[],
): void {
    const declared = new Set(context.bins);
    const seen = new Set<string>();

    for (const { line, raw, text } of bodyLines(skill)) {
        // Inside a fence the whole line is the command, and a fence is where
        // an agent copies one from. Outside it, only a backticked span is a
        // command: prose about validating a wiki is not an instruction, and a
        // rule that fired on it would be switched off.
        const spans = text.trim() === "" && raw.trim() !== ""
            ? [ raw ]
            : [ ...text.matchAll(CODE_SPAN_RE) ].map((span) => span[1] ?? "");

        for (const span of spans) {
            for (const match of span.matchAll(BIN_LIKE_RE)) {
                const bin = match[0];
                if (declared.has(bin) || seen.has(bin)) {
                    continue;
                }
                seen.add(bin);
                out.push({
                    file: skill.path,
                    keyPath: "",
                    line,
                    rule: "skill.unknownBin",
                    message: `\`${bin}\` is not a declared bin.`,
                    remedy: `Use one of ${[ ...declared ].sort().join(", ")}, `
                        + "or declare the bin in `package.json` and implement "
                        + "it under `skills/bin/`. An agent following this "
                        + "line gets a command not found and abandons the "
                        + "procedure.",
                    severity: "error",
                });
            }
        }
    }
}

/** `../doctrine.md#the-spine` into its path and its anchor. */
function splitAnchor(target: string): [ string, string | undefined ] {
    const hash = target.indexOf("#");
    return hash === -1
        ? [ target, undefined ]
        : [ target.slice(0, hash), target.slice(hash + 1) ];
}

/**
 * Resolve a relative link against the directory the skill sits in, or
 * undefined when it climbs out of the repository.
 *
 * The undefined matters. Popping an empty stack and carrying on turns
 * `../../../README.md` into `README.md`, which resolves against the repo's own
 * README and reports a link pointing outside the package as healthy.
 */
function resolvePath(
    directory: string,
    relative: string,
): string | undefined {
    if (relative.startsWith("/")) {
        return relative.replace(/^\/+/, "");
    }
    const segments = directory === "" ? [] : directory.split("/");
    for (const part of relative.split("/")) {
        if (part === "" || part === ".") {
            continue;
        }
        if (part === "..") {
            if (segments.length === 0) {
                return undefined;
            }
            segments.pop();
            continue;
        }
        segments.push(part);
    }
    return segments.join("/");
}

/**
 * Every heading in a markdown file, as the anchor a link would use.
 *
 * The slug rule is the one every markdown renderer agrees on: lowercase, drop
 * anything that is not a letter, digit, space, hyphen or underscore, and turn
 * spaces into hyphens. Headings inside a fence are examples of headings.
 */
export function headingSlugs(source: string): Set<string> {
    const slugs = new Set<string>();
    let fence: string | undefined;

    for (const line of source.split("\n")) {
        const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
        if (fence !== undefined) {
            if (marker !== undefined && marker[0] === fence[0]) {
                fence = undefined;
            }
            continue;
        }
        if (marker !== undefined) {
            fence = marker;
            continue;
        }
        const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
        if (heading !== undefined) {
            slugs.add(slugFor(heading));
        }
    }

    return slugs;
}

function slugFor(heading: string): string {
    return heading
        .toLowerCase()
        .replace(/[^\p{L}\p{N} _-]/gu, "")
        .trim()
        .replace(/\s+/g, "-");
}

function describe(value: unknown): string {
    return value === undefined ? "absent" : String(value);
}

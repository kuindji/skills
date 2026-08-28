import { describe, expect, test } from "bun:test";
import {
    mkdir,
    mkdtemp,
    readFile,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseFrontmatter } from "../markdown/frontmatter";
import { parseProfile } from "../profile/parse";
import type { Profile } from "../profile/types";
import {
    bodyHash,
    freezeDocs,
    type FreezeOutcome,
    normaliseBody,
    planFreeze,
} from "./freeze";
import { validateDocs } from "./scan";

const BODY = "# A decision\n\nWhat was decided, and why.\n";

/**
 * The hash exists to separate a rewrite from the routine. Everything a rebase,
 * a formatter or a frontmatter migration does has to leave it alone; a change
 * to the prose has to move it.
 */
/**
 * A block holding only comments is valid YAML that carries no keys, so the
 * true thing to say about it is that `status` is absent, not that the block
 * is broken. The older check counted keys against lines and could not tell
 * the two apart.
 */
/**
 * The writer has to splice at the same delimiter the parser closed the block
 * on. It searched for the first `---` after the opener while the parser had
 * matched the last, so a document whose first content line is itself `---`
 * was rewritten around a delimiter that closed nothing: the hash landed in a
 * phantom empty block and the keys that authorised the freeze were pushed
 * into the body, where nothing reads them.
 */
describe("the delimiter the hash is spliced against", () => {
    const raw = "---\n---\ntype: spec\nstatus: shipped\nfolded_into: [a]\n"
        + "---\nBody\n";

    test("a block whose first line is a rule is not rewritten around it", () => {
        const outcome = planFreeze("docs/specs/2026-08-27-a.md", raw);
        expect(outcome.kind).toBe("frozen");
        if (outcome.kind !== "frozen") {
            return;
        }
        // Re-reading what would be saved is the check that matters: the keys
        // have to still be keys, and the body has to still be the body.
        const again = parseFrontmatter(outcome.content);
        expect(again.values["status"]).toBe("shipped");
        expect(again.values["type"]).toBe("spec");
        expect(again.values["frozen_body_sha256"]).toBe(outcome.hash);
        expect(again.body).toBe("Body\n");
    });

    test("freezing it twice is a no-op, not a second hash", () => {
        const first = planFreeze("docs/specs/2026-08-27-a.md", raw);
        expect(first.kind).toBe("frozen");
        if (first.kind !== "frozen") {
            return;
        }
        expect(planFreeze("docs/specs/2026-08-27-a.md", first.content).kind)
            .toBe("unchanged");
    });
});

describe("a frontmatter block that parses but carries nothing", () => {
    test("is not reported as broken YAML", () => {
        const outcome = planFreeze(
            "docs/specs/2026-08-27-a.md",
            "---\n# nothing here yet\n---\n\nA decision.\n",
        );
        expect(outcome.kind).toBe("refused");
        if (outcome.kind !== "refused") {
            return;
        }
        expect(outcome.diagnostic.rule).toBe("freeze.notShipped");
    });
});

describe("what does not change the hash", () => {
    const same = (variant: string) =>
        expect(bodyHash(variant)).toBe(bodyHash(BODY));

    test("line endings", () => {
        same("# A decision\r\n\r\nWhat was decided, and why.\r\n");
    });

    test("trailing whitespace on a line", () => {
        same("# A decision   \n\nWhat was decided, and why.  \n");
    });

    test("trailing blank lines", () => {
        same("# A decision\n\nWhat was decided, and why.\n\n\n");
    });

    test("a leading blank line", () => {
        same("\n# A decision\n\nWhat was decided, and why.\n");
    });

    test("tabs used as trailing whitespace", () => {
        same("# A decision\t\n\nWhat was decided, and why.\n");
    });
});

describe("what does change it", () => {
    const differs = (variant: string) =>
        expect(bodyHash(variant)).not.toBe(bodyHash(BODY));

    test("reflowing a paragraph, which is an edit to the prose", () => {
        differs("# A decision\n\nWhat was decided,\nand why.\n");
    });

    test("changing a word", () => {
        differs("# A decision\n\nWhat was decided, and how.\n");
    });

    test("removing a blank line between paragraphs", () => {
        differs("# A decision\nWhat was decided, and why.\n");
    });

    // Indentation is content in markdown: it makes a code block. Trimming the
    // whole body rather than its blank lines made these two hash alike.
    test("leading whitespace on a line", () => {
        differs("# A decision\n\n    What was decided, and why.\n");
    });

    test("leading whitespace on the first line", () => {
        differs("    # A decision\n\nWhat was decided, and why.\n");
    });
});

test("the hash is 64 hex characters", () => {
    expect(bodyHash(BODY)).toMatch(/^[0-9a-f]{64}$/);
});

test("normalisation is idempotent", () => {
    const once = normaliseBody("# T  \r\n\r\nBody.\r\n\n");
    expect(normaliseBody(once)).toBe(once);
});

/**
 * Writing the key in.
 *
 * The hash above is arithmetic and hard to get wrong. Everything here is the
 * part that edits somebody's file in place, where a mistake either corrupts a
 * shipped document or writes a hash the validator will not agree with.
 */
const SHIPPED = `---
type: spec
status: shipped
folded_into:
  - business/orders
---
# A decision

What was decided, and why.
`;

/** The outcome, narrowed, so a test reads without an if. */
function frozen(outcome: FreezeOutcome) {
    if (outcome.kind !== "frozen") {
        throw new Error(
            `expected a freeze, got ${outcome.kind}: ${
                outcome.kind === "refused" ? outcome.diagnostic.message : ""
            }`,
        );
    }
    return outcome;
}

function refusal(outcome: FreezeOutcome) {
    if (outcome.kind !== "refused") {
        throw new Error(`expected a refusal, got ${outcome.kind}`);
    }
    return outcome.diagnostic;
}

describe("what it declines to freeze", () => {
    test("a document with no frontmatter block", () => {
        const diagnostic = refusal(planFreeze("a.md", "# A decision\n"));
        expect(diagnostic.rule).toBe("freeze.noFrontmatter");
    });

    test.each([ "draft", "active" ])("a %s document", (status) => {
        const raw = SHIPPED.replace("status: shipped", `status: ${status}`);
        const diagnostic = refusal(planFreeze("a.md", raw));
        expect(diagnostic.rule).toBe("freeze.notShipped");
        expect(diagnostic.message).toContain(status);
    });

    test("a document with no status at all", () => {
        const raw = SHIPPED.replace("status: shipped\n", "");
        expect(refusal(planFreeze("a.md", raw)).message).toContain("absent");
    });

    /**
     * A hash over an empty body records nothing and then passes the validator
     * for as long as the file exists.
     */
    test("a document whose body is only whitespace", () => {
        const raw = "---\ntype: spec\nstatus: shipped\n---\n\n   \n";
        expect(refusal(planFreeze("a.md", raw)).rule).toBe("freeze.emptyBody");
    });

    test("a frozen document whose body has moved since", () => {
        const first = frozen(planFreeze("a.md", SHIPPED)).content;
        const edited = first.replace("and why.", "and how.");
        const diagnostic = refusal(planFreeze("a.md", edited));
        expect(diagnostic.rule).toBe("freeze.alreadyFrozen");
        expect(diagnostic.remedy).toContain("--refreeze");
    });
});

describe("freezing", () => {
    test("the key lands inside the block, above the closing delimiter", () => {
        const { content, hash } = frozen(planFreeze("a.md", SHIPPED));
        expect(content).toBe(
            `---
type: spec
status: shipped
folded_into:
  - business/orders
frozen_body_sha256: ${hash}
---
# A decision

What was decided, and why.
`,
        );
    });

    test("the hash it writes is the one the file then carries", () => {
        const { content } = frozen(planFreeze("a.md", SHIPPED));
        expect(planFreeze("a.md", content)).toEqual({
            kind: "unchanged",
            path: "a.md",
            hash: bodyHash(SHIPPED.split("---\n")[2] ?? ""),
        });
    });

    test("freezing twice writes the same file", () => {
        const once = frozen(planFreeze("a.md", SHIPPED)).content;
        expect(planFreeze("a.md", once).kind).toBe("unchanged");
    });

    /**
     * The body is copied, never rebuilt. Rewriting its line endings would
     * change the very bytes the hash was just taken over, and the document
     * would be saved under a hash it no longer matches.
     */
    test("a CRLF document keeps its line endings, and agrees with itself", () => {
        const raw = SHIPPED.replace(/\n/g, "\r\n");
        const { content } = frozen(planFreeze("a.md", raw));
        expect(content).toContain("frozen_body_sha256: ");
        expect(
            content.split("\n").every((line) =>
                line === "" || line.endsWith("\r")
            ),
        ).toBe(true);
        expect(planFreeze("a.md", content).kind).toBe("unchanged");
    });

    test("a byte-order mark survives", () => {
        const { content } = frozen(planFreeze("a.md", `﻿${SHIPPED}`));
        expect(content.charCodeAt(0)).toBe(0xFEFF);
        expect(planFreeze("a.md", content).kind).toBe("unchanged");
    });

    test("the body below the block is untouched", () => {
        const { content } = frozen(planFreeze("a.md", SHIPPED));
        const body = (raw: string) => raw.slice(raw.lastIndexOf("---\n") + 4);
        expect(body(content)).toBe(body(SHIPPED));
    });
});

describe("a key that is already there", () => {
    test("an empty one is filled rather than duplicated", () => {
        const raw = SHIPPED.replace(
            "status: shipped\n",
            "status: shipped\nfrozen_body_sha256:\n",
        );
        const { content, hash } = frozen(planFreeze("a.md", raw));
        expect(content.match(/frozen_body_sha256/g)).toHaveLength(1);
        expect(content).toContain(`frozen_body_sha256: ${hash}`);
    });

    test("a stale one is replaced under --refreeze, and reported", () => {
        const first = frozen(planFreeze("a.md", SHIPPED));
        const edited = first.content.replace("and why.", "and how.");
        const again = frozen(
            planFreeze("a.md", edited, { refreeze: true }),
        );
        expect(again.previous).toBe(first.hash);
        expect(again.hash).not.toBe(first.hash);
        expect(again.content.match(/frozen_body_sha256/g)).toHaveLength(1);
        expect(planFreeze("a.md", again.content).kind).toBe("unchanged");
    });

    /**
     * YAML resolves a duplicated key to the last one, so leaving a second
     * copy below would keep the stale hash winning while the file visibly
     * carried the new one.
     */
    test("every duplicate goes, not just the first", () => {
        const raw = SHIPPED.replace(
            "status: shipped\n",
            "frozen_body_sha256: aaa\nstatus: shipped\nfrozen_body_sha256: bbb\n",
        );
        const { content, hash } = frozen(
            planFreeze("a.md", raw, { refreeze: true }),
        );
        expect(content).not.toContain("aaa");
        expect(content).not.toContain("bbb");
        expect(content.match(/frozen_body_sha256/g)).toHaveLength(1);
        expect(planFreeze("a.md", content)).toMatchObject({
            kind: "unchanged",
            hash,
        });
    });

    /**
     * A hash written as a list is malformed, but the lines below it are still
     * its value. Replacing only the `frozen_body_sha256:` line would leave the
     * list behind, and YAML would attach it to whatever key came next.
     */
    test("a multi-line value goes with its key", () => {
        const raw = SHIPPED.replace(
            "status: shipped\n",
            "frozen_body_sha256:\n  - aaa\n  - bbb\nstatus: shipped\n",
        );
        const { content } = frozen(planFreeze("a.md", raw, { refreeze: true }));
        expect(content).not.toContain("aaa");
        expect(content).toContain("status: shipped");
        expect(content).toContain("- business/orders");
    });

    test("a key of the same name nested under another is left alone", () => {
        const raw = SHIPPED.replace(
            "status: shipped\n",
            "status: shipped\nmeta:\n  frozen_body_sha256: kept\n",
        );
        const { content } = frozen(planFreeze("a.md", raw));
        expect(content).toContain("  frozen_body_sha256: kept");
        expect(planFreeze("a.md", content).kind).toBe("unchanged");
    });

    test("a line in the body that looks like the key is left alone", () => {
        const raw = SHIPPED.replace(
            "What was decided",
            "frozen_body_sha256: not a key\n\nWhat was decided",
        );
        const { content } = frozen(planFreeze("a.md", raw));
        expect(content).toContain("frozen_body_sha256: not a key");
    });
});

/**
 * `reopened_reason` is what the validator honours when a frozen body no longer
 * matches. Once the document is frozen again the reopening is over, and a key
 * left behind would exempt it from every later edit, silently.
 */
describe("the exemptions a refreeze spends", () => {
    const REASON = "reopened_reason: the API it describes changed";
    const reopened = SHIPPED.replace(
        "status: shipped\n",
        `status: shipped\n${REASON}\n`,
    );

    test("the whole reopen cycle closes", () => {
        // Shipped and frozen.
        const first = frozen(planFreeze("a.md", SHIPPED));
        // Reopened: the author says why, and edits, and the validator allows
        // it. Nothing here runs the writer.
        const open = first.content
            .replace("status: shipped\n", `status: shipped\n${REASON}\n`)
            .replace("and why.", "and how.");
        // Re-shipped.
        const again = frozen(planFreeze("a.md", open, { refreeze: true }));
        expect(again.cleared).toEqual([ "reopened_reason" ]);
        expect(again.content).not.toContain("reopened_reason");
        expect(again.previous).toBe(first.hash);
        expect(planFreeze("a.md", again.content).kind).toBe("unchanged");
    });

    /**
     * Including on a first freeze. The key exempts a document whose body no
     * longer matches its hash, and writing the hash is what ends that. Left
     * behind, it exempts the document from every later edit with nothing to
     * show the exemption is spent.
     */
    test("a first freeze spends it too", () => {
        const first = frozen(planFreeze("a.md", reopened));
        expect(first.cleared).toEqual([ "reopened_reason" ]);
        expect(first.content).not.toContain("reopened_reason");
    });

    test("the exemption does not outlive the freeze that resolved it", () => {
        const first = frozen(planFreeze("a.md", reopened));
        const edited = first.content.replace("and why.", "and how.");
        expect(refusal(planFreeze("a.md", edited)).rule)
            .toBe("freeze.alreadyFrozen");
    });

    /**
     * `supersedes` is not an exemption artefact. It says a later document
     * replaces this one, which stays true after a refreeze.
     */
    test("supersedes stays", () => {
        const raw = SHIPPED.replace(
            "status: shipped\n",
            "status: shipped\nsupersedes: 2026-09-01-later.md\n",
        );
        const first = frozen(planFreeze("a.md", raw));
        const edited = first.content.replace("and why.", "and how.");
        const again = frozen(planFreeze("a.md", edited, { refreeze: true }));
        expect(again.content).toContain("supersedes: 2026-09-01-later.md");
        expect(again.cleared).toEqual([]);
    });
});

/**
 * A block the parser could not read reports every key it visibly holds as
 * missing. Saying `status` is absent about a file whose second line reads
 * `status: shipped` sends the author hunting for the wrong problem.
 */
test("a frontmatter block that is not valid YAML says so", () => {
    const raw = "---\ntype: spec\nstatus: shipped: yes\n---\n# A decision\n";
    const diagnostic = refusal(planFreeze("a.md", raw));
    expect(diagnostic.rule).toBe("freeze.badFrontmatter");
});

/**
 * A hash the YAML parser turned into something other than a string is still
 * the author saying this document was frozen once.
 */
test("a recorded hash that did not parse as a string still blocks", () => {
    const raw = SHIPPED.replace(
        "status: shipped\n",
        "status: shipped\nfrozen_body_sha256: 12345678901234567890\n",
    );
    expect(refusal(planFreeze("a.md", raw)).rule).toBe("freeze.alreadyFrozen");
});

const PROFILE = `wiki:
  root: docs/wiki
  profiles: [technical]
tracker:
  backend: in-repo
  file: docs/tasks.md
docs:
  root: docs
  lifecycle: ["specs/*.md"]
  live: ["/README.md"]
  tracker: ["tasks.md"]
`;

/** A repository on disk, because `freezeDocs` reads the files git lists. */
async function repo(
    files: Record<string, string>,
): Promise<{ root: string; profile: Profile; }> {
    const root = await mkdtemp(join(tmpdir(), "docs-freeze-"));
    const all = { "project-profile.yaml": PROFILE, ...files };
    for (const [ path, content ] of Object.entries(all)) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), content);
    }
    const git = Bun.spawnSync([ "git", "init", "-q", "." ], {
        cwd: root,
        stdout: "ignore",
        stderr: "ignore",
    });
    if (git.exitCode !== 0) {
        throw new Error("git init failed");
    }
    const { profile } = parseProfile(
        PROFILE,
        join(root, "project-profile.yaml"),
    );
    if (profile === undefined) {
        throw new Error("the test profile does not parse");
    }
    return { root, profile };
}

const DRAFT = SHIPPED.replace("status: shipped", "status: draft");

describe("against a repository", () => {
    test("a sweep freezes what shipped and leaves the drafts open", async () => {
        const { root, profile } = await repo({
            "docs/specs/2026-08-01-one.md": SHIPPED,
            "docs/specs/2026-08-02-two.md": DRAFT,
            "docs/tasks.md": "## Todo\n",
            "README.md": "# A project\n",
        });
        try {
            const outcomes = await freezeDocs(profile, root);
            expect(outcomes).toHaveLength(1);
            expect(outcomes[0]).toMatchObject({
                kind: "frozen",
                path: "docs/specs/2026-08-01-one.md",
            });
            expect(
                await readFile(
                    join(root, "docs/specs/2026-08-02-two.md"),
                    "utf8",
                ),
            )
                .toBe(DRAFT);
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    /**
     * The two halves have to agree, and only an end-to-end run proves it: the
     * validator recomputes the hash from the file the writer saved, and a
     * disagreement over a single byte would leave every shipped document
     * reported as rewritten the moment it was frozen.
     */
    test("the validator accepts what the writer produced", async () => {
        const { root, profile } = await repo({
            "docs/specs/2026-08-01-one.md": SHIPPED,
            "docs/tasks.md": "## Todo\n",
            "README.md": "# A project\n",
        });
        try {
            const wikiSlugs = new Set([ "business/orders" ]);
            const before = await validateDocs(profile, root, { wikiSlugs });
            expect(before.diagnostics.map((d) => d.rule)).toContain(
                "docs.frozen",
            );

            await freezeDocs(profile, root);

            const after = await validateDocs(profile, root, { wikiSlugs });
            expect(after.diagnostics.map((d) => d.rule)).not.toContain(
                "docs.frozen",
            );
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("naming a document that is not under lifecycle control", async () => {
        const { root, profile } = await repo({
            "docs/tasks.md": "## Todo\n",
            "README.md": "# A project\n",
        });
        try {
            const [ outcome ] = await freezeDocs(profile, root, {
                paths: [ "README.md" ],
            });
            const diagnostic = refusal(outcome!);
            expect(diagnostic.rule).toBe("freeze.notLifecycle");
            expect(diagnostic.message).toContain("`live`");
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("naming a document that does not exist", async () => {
        const { root, profile } = await repo({
            "docs/tasks.md": "## Todo\n",
            "README.md": "# A project\n",
        });
        try {
            const [ outcome ] = await freezeDocs(profile, root, {
                paths: [ "docs/specs/2026-08-01-ghost.md" ],
            });
            expect(refusal(outcome!).message).toContain("No such file");
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("a dry run reports the freeze and writes nothing", async () => {
        const { root, profile } = await repo({
            "docs/specs/2026-08-01-one.md": SHIPPED,
            "docs/tasks.md": "## Todo\n",
            "README.md": "# A project\n",
        });
        try {
            const outcomes = await freezeDocs(profile, root, { dryRun: true });
            expect(outcomes[0]?.kind).toBe("frozen");
            expect(
                await readFile(
                    join(root, "docs/specs/2026-08-01-one.md"),
                    "utf8",
                ),
            )
                .toBe(SHIPPED);
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    /**
     * Naming the path is the author asserting the document is ready, so the
     * refusal a sweep swallows is the answer they asked for.
     */
    test("naming a draft reports what a sweep passes over", async () => {
        const { root, profile } = await repo({
            "docs/specs/2026-08-02-two.md": DRAFT,
            "docs/tasks.md": "## Todo\n",
            "README.md": "# A project\n",
        });
        try {
            const [ outcome ] = await freezeDocs(profile, root, {
                paths: [ "docs/specs/2026-08-02-two.md" ],
            });
            expect(refusal(outcome!).rule).toBe("freeze.notShipped");
        }
        finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});

/**
 * A flow collection split over several lines is valid YAML that the parser
 * this repo uses does not accept. Measured across the real corpora it never
 * occurs: 183 frontmatter blocks, none unreadable. Pinned here so the refusal
 * stays the actionable one rather than reporting `status` as absent from a
 * file whose third line sets it.
 */
test("a multi-line flow collection is refused, and says how to write it", () => {
    const raw = SHIPPED.replace(
        "folded_into:\n  - business/orders\n",
        "folded_into: [\n  business/orders,\n]\n",
    );
    const diagnostic = refusal(planFreeze("a.md", raw));
    expect(diagnostic.rule).toBe("freeze.badFrontmatter");
    expect(diagnostic.remedy).toContain("one line");
});

/** Shapes the gpt-5.5 review found, each corrupting a file the writer saved. */
describe("frontmatter the splice must not mangle", () => {
    /**
     * A blank line inside a literal block scalar belongs to the value. Ending
     * the removal at the first blank left the rest of the prose behind, where
     * YAML folded it into whatever key sat above.
     */
    test("a removed block scalar takes its blank lines with it", () => {
        const raw = SHIPPED.replace(
            "status: shipped\n",
            "status: shipped\nreopened_reason: |\n  The API changed.\n\n"
                + "  The old contract no longer applies.\n",
        );
        const { content } = frozen(planFreeze("a.md", raw, { refreeze: true }));
        expect(content).not.toContain("no longer applies");
        expect(parseFrontmatter(content).values["status"]).toBe("shipped");
    });

    /**
     * Deleting an anchored key leaves every alias to it dangling, and the file
     * the writer saved no longer parses at all. Refusing is the only honest
     * answer: the tool cannot know what the author meant the alias to mean.
     */
    test("an anchored key is refused rather than deleted", () => {
        const raw = SHIPPED.replace(
            "status: shipped\n",
            "status: shipped\nfrozen_body_sha256: &hash old\n"
                + "previous_freeze: *hash\n",
        );
        const diagnostic = refusal(planFreeze("a.md", raw, { refreeze: true }));
        expect(diagnostic.rule).toBe("freeze.anchoredKey");
    });

    test("a quoted key is a duplicate too, and goes", () => {
        const raw = SHIPPED.replace(
            "status: shipped\n",
            'status: shipped\n"frozen_body_sha256": old\n',
        );
        const { content, hash } = frozen(
            planFreeze("a.md", raw, { refreeze: true }),
        );
        expect(content).not.toContain(": old");
        expect(content).not.toContain('"frozen_body_sha256"');
        expect(content.match(/frozen_body_sha256/g)).toHaveLength(1);
        expect(parseFrontmatter(content).values["frozen_body_sha256"])
            .toBe(hash);
    });
});

describe("a document that is not really in the repository", () => {
    /**
     * A tracked symlink is a path inside the repository naming a file outside
     * it, and freezing is the only thing in this system that writes. Measured
     * before this refusal existed, a repo holding
     * `docs/specs/2026-08-28-outside.md -> /tmp/outside.md` had that file
     * rewritten by a bare `docs-freeze`, which then reported no problems.
     */
    test("a link out of the repo is refused rather than written through", async () => {
        const directory = await mkdtemp(join(tmpdir(), "freeze-link-"));
        const outside = join(directory, "outside.md");
        const repo = join(directory, "repo");
        try {
            await mkdir(join(repo, "docs/specs"), { recursive: true });
            await Bun.spawn([ "git", "init", "-q" ], { cwd: repo }).exited;
            await writeFile(
                join(repo, "project-profile.yaml"),
                "tracker:\n  backend: in-repo\n  file: docs/tasks.md\n",
            );
            const body = "---\ntype: spec\nstatus: shipped\n---\n\nOutside.\n";
            await writeFile(outside, body);
            await symlink(
                outside,
                join(repo, "docs/specs/2026-08-28-outside.md"),
            );

            const profile = parseProfile(
                `tracker:
  backend: in-repo
  file: docs/tasks.md
docs:
  root: docs
  lifecycle: ["specs/*.md"]
`,
                "project-profile.yaml",
            ).profile!;

            const outcomes = await freezeDocs(profile, repo);
            expect(outcomes).toHaveLength(1);
            expect(outcomes[0]?.kind).toBe("refused");
            expect(
                outcomes[0]?.kind === "refused"
                    ? outcomes[0].diagnostic.rule
                    : undefined,
            ).toBe("freeze.outsideRepository");
            expect(await readFile(outside, "utf8")).toBe(body);
        }
        finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});

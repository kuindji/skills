/**
 * The body hash that freezes a shipped document.
 *
 * A shipped spec is frozen: it records what was decided, and editing it
 * rewrites history that later decisions were made against. Immutability is
 * enforced by hashing rather than by git, because git-based immutability fires
 * on all the routine things that are not rewrites: a rebase, a formatting
 * sweep, a frontmatter migration, or a wiki slug rename that forces a
 * `folded_into` link update.
 *
 * Hashing the body after the frontmatter is what makes that distinction
 * mechanical. Metadata and link maintenance stay legal; the substance stays
 * frozen. It also removes the chicken-and-egg problem of writing a hash into a
 * file the hash covers.
 */

/**
 * Normalise a body before hashing.
 *
 * Line endings go to `\n`, trailing whitespace goes from every line, and the
 * leading and trailing blank lines go from the whole. The spec asks for the
 * hash to survive a formatting sweep, and stripping only the document's final
 * newline would not: the commonest thing a formatter does is remove trailing
 * spaces from lines it otherwise leaves alone. Reflowing a paragraph does
 * change the hash, which is correct. That is an edit to the prose.
 *
 * Blank lines are removed, not whitespace. Trimming the whole string would
 * also eat the indentation of the first line, and in Markdown that
 * indentation is content: `    # Decision` is a code block and `# Decision`
 * is a heading, and the two must not hash alike.
 */
export function normaliseBody(body: string): string {
    return body
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.replace(/[ \t]+$/, ""))
        .join("\n")
        .replace(/^\n+/, "")
        .replace(/\n+$/, "");
}

/** The recorded `frozen_body_sha256` of a document body. */
export function bodyHash(body: string): string {
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(normaliseBody(body));
    return hasher.digest("hex");
}

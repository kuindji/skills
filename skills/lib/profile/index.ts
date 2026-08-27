import type { Diagnostic, Mode, Profile } from "./types";

export interface ProductIndex {
    /** Applies where no product claims the path. */
    root: Profile;
    products: Profile[];
    diagnostics: Diagnostic[];
}

/**
 * Build the path-to-product lookup for a repository.
 *
 * Products own disjoint subtrees that do not nest: one product holds an app,
 * some packages and a docs folder at once. Directory ancestry cannot express
 * that, so resolution is a match against declared paths, and the paths are
 * required to partition cleanly rather than overlap.
 */
export function buildProductIndex(
    root: Profile,
    products: Profile[],
): ProductIndex {
    const diagnostics: Diagnostic[] = [];

    const seenNames = new Map<string, string>();
    for (const product of products) {
        const name = product.product;
        if (name === undefined) {
            diagnostics.push({
                file: product.sourcePath,
                keyPath: "product",
                rule: "products.unnamed",
                message: "A product profile does not declare a product name.",
                remedy:
                    "Add `product: <name>`. A profile with no name cannot be "
                    + "referred to by a tracker, a task, or another profile.",
                severity: "error",
            });
            continue;
        }

        const previous = seenNames.get(name);
        if (previous !== undefined) {
            diagnostics.push({
                file: product.sourcePath,
                keyPath: "product",
                rule: "products.duplicateName",
                message: `Two profiles both declare the product \`${name}\`: `
                    + `${previous} and ${product.sourcePath}.`,
                remedy: "Give each product a distinct name, or merge the two "
                    + "profiles if they describe one product.",
                severity: "error",
            });
        }
        else {
            seenNames.set(name, product.sourcePath);
        }

        // A product with no paths claims nothing, so nothing resolves to it and
        // its docs, mode and roadmap are unreachable.
        if (product.paths.length === 0) {
            diagnostics.push({
                file: product.sourcePath,
                keyPath: "paths",
                rule: "products.noPaths",
                message: `Product \`${name}\` claims no paths.`,
                remedy:
                    "Add `paths:` listing the directories this product owns. "
                    + "Without them nothing resolves to this profile and its "
                    + "docs and mode settings are never applied.",
                severity: "error",
            });
        }
    }

    // Overlap is checked pattern against pattern rather than file by file, so
    // the error names the products at configuration time rather than waiting
    // for a file that happens to sit in the contested subtree.
    for (let i = 0; i < products.length; i++) {
        for (let j = i + 1; j < products.length; j++) {
            const a = products[i]!;
            const b = products[j]!;
            for (const pattern of a.paths) {
                if (b.paths.some((other) => patternsCollide(pattern, other))) {
                    diagnostics.push({
                        file: b.sourcePath,
                        keyPath: "paths",
                        rule: "products.overlap",
                        message: `\`${pattern}\` is claimed by both `
                            + `\`${a.product}\` and \`${b.product}\`.`,
                        remedy:
                            "Product paths must partition the repo. Give the "
                            + "path to one product, or move the shared part "
                            + "somewhere no product claims, where the root "
                            + "profile governs it.",
                        severity: "error",
                    });
                }
            }
        }
    }

    return { root, products, diagnostics };
}

/** The profile governing a path: its product, or the root profile. */
export function productForPath(
    index: ProductIndex,
    repoRelativePath: string,
): Profile | undefined {
    for (const product of index.products) {
        if (
            product.paths.some((pattern) => covers(pattern, repoRelativePath))
        ) {
            return product;
        }
    }
    return index.root;
}

/**
 * The mode for a path.
 *
 * Mode is per path rather than per project, so a hardened package inside a
 * greenfield product keeps its stricter gates. The longest matching override
 * wins, which lets a subtree opt back out of its parent's override.
 */
export function modeForPath(
    index: ProductIndex,
    repoRelativePath: string,
): Mode {
    const profile = productForPath(index, repoRelativePath) ?? index.root;
    let best: { prefix: string; mode: Mode; } | undefined;
    for (const [ prefix, mode ] of Object.entries(profile.mode.overrides)) {
        if (!covers(prefix, repoRelativePath)) {
            continue;
        }
        if (best === undefined || prefix.length > best.prefix.length) {
            best = { prefix, mode };
        }
    }
    return best?.mode ?? profile.mode.default;
}

/** Whether a declared pattern covers a path, as a prefix or as a glob. */
function covers(pattern: string, path: string): boolean {
    if (path === pattern || path.startsWith(`${pattern}/`)) {
        return true;
    }
    const glob = new Bun.Glob(pattern);
    if (glob.match(path)) {
        return true;
    }
    const head = path.split("/").slice(0, pattern.split("/").length).join("/");
    return glob.match(head);
}

/**
 * Whether two declared patterns could ever claim the same file.
 *
 * Compared as patterns, not as matched files, so an overlap is reported when
 * the profiles are read rather than when a file lands in the contested space.
 */
function patternsCollide(a: string, b: string): boolean {
    return covers(a, b) || covers(b, a);
}

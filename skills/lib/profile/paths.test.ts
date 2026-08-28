import { describe, expect, test } from "bun:test";
import { claims, patternsCollide } from "./paths";

/**
 * The claim matcher answers one question for product paths, owner paths and
 * generated paths alike. These cases are the shapes the real profiles in the
 * fixtures actually declare.
 */
describe("claiming a path", () => {
    test("a pattern naming a directory claims what is inside it", () => {
        expect(claims("packages/ui", "packages/ui/src/Button.tsx")).toBe(true);
    });

    test("a pattern naming a file claims exactly that file", () => {
        expect(claims("bun.lock", "bun.lock")).toBe(true);
        expect(claims("bun.lock", "apps/x/bun.lock")).toBe(false);
    });

    test("a wildcard segment claims the subtree beneath it", () => {
        expect(claims("packages/sleep-*", "packages/sleep-domain/src/i.ts"))
            .toBe(true);
    });

    test("`**` spans zero directories as well as many", () => {
        expect(claims("hasura/**/*.yaml", "hasura/tables.yaml")).toBe(true);
        expect(claims("hasura/**/*.yaml", "hasura/a/b/tables.yaml")).toBe(true);
        expect(claims("**/expo-env.d.ts", "expo-env.d.ts")).toBe(true);
        expect(claims("**/expo-env.d.ts", "apps/detector/expo-env.d.ts"))
            .toBe(true);
    });

    test("a wildcard segment does not span a directory boundary", () => {
        expect(claims("apps/*/ios/**", "apps/detector/ios/Podfile")).toBe(true);
        expect(claims("apps/*/ios/**", "apps/a/b/ios/Podfile")).toBe(false);
    });

    test("an unrelated path is not claimed", () => {
        expect(claims("packages/ui", "packages/uikit/src/a.ts")).toBe(false);
        expect(claims("web", "website/index.html")).toBe(false);
    });
});

/**
 * Writing `packages/ui/` for a directory is the natural thing to do and reads
 * as identical to `packages/ui`. Before this was handled it matched nothing at
 * all: the trailing slash silently switched the claim off, which for an owner
 * means the guard stops refusing the writes it was installed to refuse, and
 * says nothing about why.
 */
describe("a trailing slash", () => {
    test("does not disable a directory claim", () => {
        expect(claims("packages/ui/", "packages/ui/src/Button.tsx")).toBe(true);
    });

    test("still claims the directory itself", () => {
        expect(claims("packages/ui/", "packages/ui")).toBe(true);
    });

    test("does not widen the claim to a sibling", () => {
        expect(claims("packages/ui/", "packages/uikit/a.ts")).toBe(false);
    });

    test("on a nested claim behaves like the unslashed form", () => {
        expect(claims("docs/wiki/", "docs/wiki/page.md")).toBe(true);
        expect(claims("docs/wiki/", "docs/specs/page.md")).toBe(false);
    });

    test("a pattern of nothing but slashes claims nothing", () => {
        expect(claims("/", "anything.md")).toBe(false);
        expect(claims("", "anything.md")).toBe(false);
    });
});

describe("colliding patterns", () => {
    test("a directory and something inside it collide", () => {
        expect(patternsCollide("packages", "packages/ui")).toBe(true);
    });

    test("siblings do not collide", () => {
        expect(patternsCollide("apps/detector", "apps/game")).toBe(false);
    });

    test("a trailing slash does not hide a collision", () => {
        expect(patternsCollide("packages/", "packages/ui")).toBe(true);
    });
});

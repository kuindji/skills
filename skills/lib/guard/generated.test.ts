import { describe, expect, test } from "bun:test";
import { parseProfile } from "../profile/parse";
import type { Diagnostic, Profile } from "../profile/types";
import { guardChange, writeIsAllowed } from "./generated";

function profileFrom(yaml: string): Profile {
    const result = parseProfile(yaml, "/repo/project-profile.yaml");
    if (!result.profile) {
        throw new Error(JSON.stringify(result.diagnostics));
    }
    return result.profile;
}

/** A four-product repo: four clones, a shared complement default. */
const MULTI_CLONE = profileFrom(`
tracker:
  backend: linear
generated_paths:
  - "apps/*/ios/**"
  - "**/expo-env.d.ts"
owners:
  main:
    paths: [packages/ui, apps/ui-showcase, docs/wiki]
    shared: true
    default: true
  notes:
    paths: [apps/notes-app, "packages/notes-*"]
  quiz-arcade:
    paths: [apps/quiz, apps/arcade]
`);

/** A mature single-product repo: one clone, no owners, tracked output. */
const SINGLE_CLONE = profileFrom(`
tracker:
  backend: clickup
generated_paths:
  - "hasura/**/*.yaml"
`);

function rules(diagnostics: Diagnostic[]): string[] {
    return diagnostics.map((d) => d.rule);
}

function forFile(diagnostics: Diagnostic[], file: string): Diagnostic[] {
    return diagnostics.filter((d) => d.file === file);
}

describe("touching a generated file", () => {
    test("is refused, naming the pattern that claimed it", () => {
        const [ diagnostic ] = guardChange({
            profile: SINGLE_CLONE,
            paths: [ "hasura/main/metadata/tables/public_Order.yaml" ],
        });
        expect(diagnostic?.rule).toBe("guard.generatedPath");
        expect(diagnostic?.severity).toBe("error");
        expect(diagnostic?.message).toContain("hasura/**/*.yaml");
    });

    test("an ordinary file alongside it is not refused", () => {
        const diagnostics = guardChange({
            profile: SINGLE_CLONE,
            paths: [ "src/order.ts", "hasura/main/metadata/x.yaml" ],
        });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.file).toBe("hasura/main/metadata/x.yaml");
    });

    /**
     * A gitignored generated tree never appears in a diff, so these paths can
     * only arrive from a caller asking about a write it is about to make. The
     * rule has to hold for them the same way.
     */
    test("holds for a path git would never report", () => {
        const diagnostics = guardChange({
            profile: MULTI_CLONE,
            paths: [ "apps/quiz/ios/Podfile" ],
        });
        expect(rules(diagnostics)).toContain("guard.generatedPath");
    });

    test("is reported once even when two patterns claim the path", () => {
        const overlapping = profileFrom(`
tracker:
  backend: clickup
generated_paths: ["gen/**", "gen/**/*.ts"]
`);
        const diagnostics = guardChange({
            profile: overlapping,
            paths: [ "gen/a.ts" ],
        });
        expect(diagnostics).toHaveLength(1);
    });

    test("naming the path explicitly acknowledges the regeneration", () => {
        const diagnostics = guardChange({
            profile: SINGLE_CLONE,
            paths: [ "hasura/main/metadata/x.yaml" ],
            acknowledged: [ "hasura/main/metadata/x.yaml" ],
        });
        expect(diagnostics).toEqual([]);
    });

    /**
     * Acknowledging one file must not acknowledge its neighbours. A
     * regeneration commit names what it regenerated.
     */
    test("acknowledging one path does not acknowledge another", () => {
        const diagnostics = guardChange({
            profile: SINGLE_CLONE,
            paths: [ "hasura/a.yaml", "hasura/b.yaml" ],
            acknowledged: [ "hasura/a.yaml" ],
        });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.file).toBe("hasura/b.yaml");
    });

    /**
     * The escape hatch must not accept a path form the guard rejects
     * everywhere else. `/hasura/x.yaml` is refused outright when it arrives as
     * a changed path, so letting the same string acknowledge one silently
     * makes the lenient side of the guard the more permissive one.
     */
    test("an acknowledgement must be repo-relative like any other path", () => {
        for (const ack of [ "/hasura/x.yaml", "//hasura/x.yaml", "" ]) {
            expect(rules(guardChange({
                profile: SINGLE_CLONE,
                paths: [ "hasura/x.yaml" ],
                acknowledged: [ ack ],
            }))).toEqual([ "guard.generatedPath" ]);
        }
    });

    test("a project declaring no generated paths refuses nothing", () => {
        const none = profileFrom("tracker:\n  backend: clickup\n");
        expect(guardChange({ profile: none, paths: [ "anything.yaml" ] }))
            .toEqual([]);
    });
});

/**
 * The guard is asked about paths by callers that did not necessarily produce
 * them the way git does. An editor hook hands over an absolute path; a shell
 * hands over `./name`. Both named the same file as a bare repo-relative path
 * would, and before this was handled both walked straight past every rule —
 * the one outcome a guard must never have.
 */
describe("a path that is not plainly repo-relative", () => {
    test("a leading ./ does not slip past the rules", () => {
        expect(rules(guardChange({
            profile: SINGLE_CLONE,
            paths: [ "./hasura/x.yaml" ],
        }))).toEqual([ "guard.generatedPath" ]);
    });

    test("an absolute path is refused rather than silently passed", () => {
        const [ diagnostic ] = guardChange({
            profile: SINGLE_CLONE,
            paths: [ "/Users/me/repo/hasura/x.yaml" ],
        });
        expect(diagnostic?.rule).toBe("guard.unrelativePath");
        expect(diagnostic?.severity).toBe("error");
    });

    /**
     * `docs/../apps/quiz/x.ts` is a path inside `apps/quiz`, but
     * matched as text it starts with `docs/` and would be attributed to
     * whoever owns `docs`. The guard cannot resolve it without the repo root,
     * so it says so instead of guessing.
     */
    test("a path climbing out of a directory is refused, not attributed", () => {
        const [ diagnostic ] = guardChange({
            profile: MULTI_CLONE,
            currentOwner: "notes",
            paths: [ "docs/wiki/../../apps/quiz/x.ts" ],
        });
        expect(diagnostic?.rule).toBe("guard.unrelativePath");
    });

    /**
     * `""` and `"."` name no file, so no rule can say anything about them.
     * Staying silent is the shape of every fail-open here, so the guard says
     * it cannot answer instead.
     */
    test("a path naming nothing is refused rather than passed in silence", () => {
        for (const path of [ "", ".", "./" ]) {
            const [ diagnostic ] = guardChange({
                profile: SINGLE_CLONE,
                paths: [ path ],
            });
            expect(diagnostic?.rule).toBe("guard.unrelativePath");
        }
    });

    test("a dot segment in the middle is harmless and still checked", () => {
        expect(rules(guardChange({
            profile: SINGLE_CLONE,
            paths: [ "hasura/./x.yaml" ],
        }))).toEqual([ "guard.generatedPath" ]);
    });
});

describe("writing outside the current clone's scope", () => {
    test("writing inside its own scope is allowed", () => {
        expect(guardChange({
            profile: MULTI_CLONE,
            currentOwner: "notes",
            paths: [ "apps/notes-app/src/app.tsx" ],
        })).toEqual([]);
    });

    test("another owner's explicit claim is refused", () => {
        const [ diagnostic ] = guardChange({
            profile: MULTI_CLONE,
            currentOwner: "notes",
            paths: [ "apps/quiz/src/index.ts" ],
        });
        expect(diagnostic?.rule).toBe("guard.ownerScope");
        expect(diagnostic?.severity).toBe("error");
        expect(diagnostic?.message).toContain("quiz-arcade");
    });

    test("a shared package claimed by the default owner is refused", () => {
        const [ diagnostic ] = guardChange({
            profile: MULTI_CLONE,
            currentOwner: "notes",
            paths: [ "packages/ui/src/Button.tsx" ],
        });
        expect(diagnostic?.rule).toBe("guard.ownerScope");
        expect(diagnostic?.severity).toBe("error");
    });

    /**
     * The complement is where root configuration lives. Of 701 real commits,
     * 36 reach the default owner this way and nothing else, led by `bun.lock`
     * and the root `package.json`, which that repo's rules expressly allow a
     * product clone to commit. An error here refuses every routine install, so
     * the guard notes it and moves on.
     */
    test("a path nobody claimed is noted, not refused", () => {
        const [ diagnostic ] = guardChange({
            profile: MULTI_CLONE,
            currentOwner: "notes",
            paths: [ "bun.lock" ],
        });
        expect(diagnostic?.rule).toBe("guard.unclaimedPath");
        expect(diagnostic?.severity).toBe("warning");
    });

    /**
     * Advice about the change, given once. Replaying real history found single
     * commits carrying 57 and 60 copies of this warning, all of them about one
     * unclaimed top-level directory that had just been imported.
     */
    test("many unclaimed paths are noted once, with the count", () => {
        const diagnostics = guardChange({
            profile: MULTI_CLONE,
            currentOwner: "notes",
            paths: [ "reference/a.swift", "reference/b.swift", "bun.lock" ],
        });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.rule).toBe("guard.unclaimedPath");
        expect(diagnostics[0]?.message).toContain("3");
    });

    /**
     * With no default owner nothing claims the complement, so "nobody owns
     * this" is not permission — it is a profile that has not said who does.
     * Passing it silently is the fail-open case: the same path in a repo that
     * does declare a default owner is at least noted.
     */
    test("with no default owner, an unclaimed path is still noted", () => {
        const noDefault = profileFrom(`
tracker:
  backend: linear
owners:
  app:
    paths: [apps/app]
  other:
    paths: [apps/other]
`);
        const [ diagnostic ] = guardChange({
            profile: noDefault,
            currentOwner: "app",
            paths: [ "README.md" ],
        });
        expect(diagnostic?.rule).toBe("guard.unclaimedPath");
    });

    test("the default owner writing the complement is not noted at all", () => {
        expect(guardChange({
            profile: MULTI_CLONE,
            currentOwner: "main",
            paths: [ "bun.lock" ],
        })).toEqual([]);
    });

    test("a repo declaring no owners restricts nothing", () => {
        expect(guardChange({
            profile: SINGLE_CLONE,
            currentOwner: undefined,
            paths: [ "anywhere/at/all.ts" ],
        })).toEqual([]);
    });

    test("an unresolved owner is refused, saying how to declare one", () => {
        const [ diagnostic ] = guardChange({
            profile: MULTI_CLONE,
            currentOwner: undefined,
            paths: [ "apps/quiz/x.ts" ],
        });
        expect(diagnostic?.rule).toBe("guard.ownerUnresolved");
        expect(diagnostic?.severity).toBe("error");
        expect(diagnostic?.remedy).toContain(".agent-owner");
    });

    test("an unresolved owner is reported once, not once per path", () => {
        const diagnostics = guardChange({
            profile: MULTI_CLONE,
            currentOwner: undefined,
            paths: [ "a.ts", "b.ts", "c.ts" ],
        });
        expect(diagnostics).toHaveLength(1);
    });

    test("an owner name nobody declared is refused, listing the real ones", () => {
        const [ diagnostic ] = guardChange({
            profile: MULTI_CLONE,
            currentOwner: "baby-sleap",
            paths: [ "apps/notes-app/x.ts" ],
        });
        expect(diagnostic?.rule).toBe("guard.unknownOwner");
        expect(diagnostic?.message).toContain("baby-sleap");
        expect(diagnostic?.remedy).toContain("quiz-arcade");
    });
});

/**
 * A shared owner's code has consumers outside its own tree, so a change to it
 * is not finished when it typechecks in place. The check fires on a write that
 * is entirely allowed, which is why it is a warning: nothing is wrong yet.
 */
describe("changing a shared owner's code", () => {
    test("asks for a blast-radius check", () => {
        const [ diagnostic ] = guardChange({
            profile: MULTI_CLONE,
            currentOwner: "main",
            paths: [ "packages/ui/src/Button.tsx" ],
        });
        expect(diagnostic?.rule).toBe("guard.sharedBlastRadius");
        expect(diagnostic?.severity).toBe("warning");
    });

    /**
     * The default owner is shared here, so every unclaimed path in the repo
     * would otherwise ask for a consumer audit — 259 of 1167 tracked files in
     * the real repository, most of them documents with no consumers at all.
     */
    test("does not fire on paths reached only by the complement", () => {
        expect(guardChange({
            profile: MULTI_CLONE,
            currentOwner: "main",
            paths: [ "README.md" ],
        })).toEqual([]);
    });

    /**
     * The advice is "run the repository-wide typecheck", which is done once
     * however many files changed. Repeated per file it drowns everything else:
     * replaying 701 real commits produced 1,162 of these, and the worst single
     * commit carried twelve.
     */
    test("is asked once for the change, not once per file", () => {
        const diagnostics = guardChange({
            profile: MULTI_CLONE,
            currentOwner: "main",
            paths: [
                "packages/ui/a.tsx",
                "packages/ui/b.tsx",
                "apps/ui-showcase/c.tsx",
            ],
        });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]?.rule).toBe("guard.sharedBlastRadius");
    });

    test("does not fire for an owner that is not shared", () => {
        expect(guardChange({
            profile: MULTI_CLONE,
            currentOwner: "notes",
            paths: [ "apps/notes-app/src/app.tsx" ],
        })).toEqual([]);
    });
});

describe("a change breaking several rules", () => {
    test("reports each rule against the path it applies to", () => {
        const diagnostics = guardChange({
            profile: MULTI_CLONE,
            currentOwner: "notes",
            paths: [
                "apps/notes-app/expo-env.d.ts",
                "apps/quiz/src/index.ts",
                "apps/notes-app/src/app.tsx",
            ],
        });
        expect(rules(forFile(diagnostics, "apps/quiz/src/index.ts")))
            .toEqual([ "guard.ownerScope" ]);
        expect(
            rules(
                forFile(diagnostics, "apps/notes-app/expo-env.d.ts"),
            ),
        ).toEqual([ "guard.generatedPath" ]);
        expect(forFile(diagnostics, "apps/notes-app/src/app.tsx"))
            .toEqual([]);
    });

    test("results are ordered by path so two runs read the same", () => {
        const diagnostics = guardChange({
            profile: MULTI_CLONE,
            currentOwner: "notes",
            paths: [ "packages/ui/b.ts", "apps/quiz/a.ts" ],
        });
        expect(diagnostics.map((d) => d.file)).toEqual([
            "apps/quiz/a.ts",
            "packages/ui/b.ts",
        ]);
    });
});

/**
 * The single-path form a pre-write check asks. It is a wrapper over the same
 * rules rather than a second copy of them: two implementations of "may I write
 * here" drifting apart would mean the hook and the validator disagree, and the
 * one a person sees is not the one that runs.
 */
describe("asking about one write", () => {
    test("inside its own scope, allowed", () => {
        expect(
            writeIsAllowed(
                MULTI_CLONE,
                "notes",
                "apps/notes-app/a.ts",
            )
                .allowed,
        ).toBe(true);
    });

    test("another owner's explicit claim, refused with a reason", () => {
        const verdict = writeIsAllowed(
            MULTI_CLONE,
            "notes",
            "packages/ui/src/Button.tsx",
        );
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain("main");
    });

    test("a generated file, refused", () => {
        expect(writeIsAllowed(SINGLE_CLONE, undefined, "hasura/x.yaml").allowed)
            .toBe(false);
    });

    /**
     * The measured carve-out: a lockfile falls to the default owner only
     * because nobody claimed it, and every clone commits one after an install.
     */
    test("an unclaimed root file, allowed", () => {
        expect(writeIsAllowed(MULTI_CLONE, "notes", "bun.lock").allowed)
            .toBe(true);
    });

    test("with no owners declared, allowed", () => {
        expect(writeIsAllowed(SINGLE_CLONE, undefined, "anything.ts").allowed)
            .toBe(true);
    });

    test("an unresolved owner, refused", () => {
        expect(
            writeIsAllowed(MULTI_CLONE, undefined, "apps/quiz/a.ts")
                .allowed,
        ).toBe(false);
    });
});

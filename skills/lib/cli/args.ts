import { EXIT, type Io } from "./report";

/**
 * Argument parsing for the validator bins.
 *
 * Deliberately small and deliberately strict. These tools are run by agents as
 * often as by people, and an agent that mistypes a flag has no way to notice
 * that its `--dry-run` was ignored: the run succeeds and writes the files it
 * was told not to touch. So an unknown flag is a refusal, not a shrug, and
 * every bin declares exactly the flags it honours.
 */

export interface FlagSpec {
    /** Flags that take no value. */
    booleans?: string[];
    /** Flags that take a value, and may be given more than once. */
    values?: string[];
    /** Single-letter aliases, e.g. `{ h: "help" }`. */
    aliases?: Record<string, string>;
}

export interface Args {
    positionals: string[];
    /** Flags given without a value. */
    booleans: Set<string>;
    /** Values given per flag, in order, for flags that take one. */
    values: Map<string, string[]>;
    /** Anything the spec does not allow. A caller with errors must not run. */
    errors: string[];
}

export function parseArgs(argv: string[], spec: FlagSpec = {}): Args {
    const booleans = new Set(spec.booleans ?? []);
    const takesValue = new Set(spec.values ?? []);
    const aliases = spec.aliases ?? {};

    const args: Args = {
        positionals: [],
        booleans: new Set(),
        values: new Map(),
        errors: [],
    };

    let literal = false;
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i] as string;

        if (literal || token === "-" || !token.startsWith("-")) {
            args.positionals.push(token);
            continue;
        }
        if (token === "--") {
            // Everything after it is a path, which is how a file named
            // `--dry-run` is passed to docs-freeze rather than parsed.
            literal = true;
            continue;
        }

        const bare = token.startsWith("--") ? token.slice(2) : token.slice(1);
        const eq = bare.indexOf("=");
        const rawName = eq === -1 ? bare : bare.slice(0, eq);
        const inline = eq === -1 ? undefined : bare.slice(eq + 1);
        const name = aliases[rawName] ?? rawName;

        if (booleans.has(name)) {
            if (inline !== undefined) {
                args.errors.push(`\`--${rawName}\` takes no value.`);
                continue;
            }
            args.booleans.add(name);
            continue;
        }

        if (takesValue.has(name)) {
            const value = inline ?? argv[++i];
            if (value === undefined) {
                args.errors.push(`\`--${rawName}\` needs a value.`);
                continue;
            }
            const seen = args.values.get(name) ?? [];
            seen.push(value);
            args.values.set(name, seen);
            continue;
        }

        args.errors.push(`Unknown option \`${token}\`.`);
    }

    return args;
}

/** The single value of a flag, or undefined. The last one given wins. */
export function value(args: Args, name: string): string | undefined {
    const all = args.values.get(name);
    return all === undefined ? undefined : all[all.length - 1];
}

/** Every value of a repeatable flag, in the order given. */
export function values(args: Args, name: string): string[] {
    return args.values.get(name) ?? [];
}

/**
 * The argument handling every bin does before it looks at a repository.
 *
 * Returns the parsed arguments, or the exit code the bin should return: help
 * was asked for, or a flag was wrong. A bad flag prints the usage text,
 * because the reader is one character away from what they meant.
 */
export function preflight(
    argv: string[],
    spec: FlagSpec,
    help: string,
    io: Io,
): Args | number {
    const args = parseArgs(argv, spec);
    if (args.booleans.has("help")) {
        io.out(help);
        return EXIT.ok;
    }
    if (args.errors.length > 0) {
        for (const error of args.errors) {
            io.err(error);
        }
        io.err("");
        io.err(help);
        return EXIT.unusable;
    }
    return args;
}

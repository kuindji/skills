#!/usr/bin/env bun
/**
 * Entry point. The rules live in the library; a bin only connects them to a
 * process, so that every executable path in this package is one line long and
 * the behaviour behind it is testable without spawning anything.
 */
import { run } from "../lib/cli/guard-generated";
import { consoleIo } from "../lib/cli/report";

process.exit(await run(Bun.argv.slice(2), consoleIo));

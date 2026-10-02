# plado-genome
Reads the **declared contracts** of MCP servers listed in the [Plado](https://plado.pages.dev) catalog: tool names, input/output JSON schemas and tool annotations. They are the first layer of a typed "solution genome", which records which add-ons can actually be composed with which.

## What it does
For each server in `data/servers.json` (pinned versions, already through Plado's static security scan):
1. Starts a throwaway Docker container (1 CPU, 1 GB, 256 processes, all capabilities dropped, `no-new-privileges`).
2. Installs the exact pinned package: npm with lifecycle scripts disabled; Python with `--no-build` (wheels only, so no third-party build code runs). Packages that need a build step fail and are recorded as such.
3. **Disconnects the container from every network**, then starts the server over stdio.
4. Sends `initialize`, `tools/list`, `prompts/list`, `resources/list`. **It never calls a tool.**
5. Records the result and deletes the container.

No credentials exist in this environment. The workflow runs with `contents: read` and no secrets.

## Run
Actions → `tier-a-contracts` → Run workflow (shards, limit). The results are uploaded as artifacts.
Local test of the MCP client (no Docker needed): `node test/run-test.mjs`.

## Output fields
`id`, `cmd`, `ok`, `stage`, `server`, `protocolVersion`, `capabilities`, `tools[]` (`name`, `description`, `inputSchema`, `outputSchema`, `annotations`), `prompts[]`, `resources[]`, `envHints[]` (env-var names mentioned on stderr), `networkCut` (measured after the run), `stderrTail`, `error`, `ms`.

A server that needs credentials just to start shows up as `ok:false` with `envHints`. That is a fact about it, not a verdict.

License: MIT.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const tempDir = path.join(rootDir, "temp");
const lockDir = path.join(tempDir, "build-wasm.lock");
const staleLockMs = 30 * 60 * 1000;

await withBuildLock(() => {
  run("bun", ["./scripts/check-wasm-output-writable.mjs"]);
  run("wasm-pack", [
    "build",
    "crates/viz-engine-wasm",
    "--target",
    "bundler",
    "--out-dir",
    "../../src/wasm/pkg",
  ]);
  run("bun", ["./scripts/embed-wasm.mjs"]);
});

async function withBuildLock(callback) {
  await acquireLock();

  try {
    callback();
  } finally {
    rmSync(lockDir, { force: true, recursive: true });
  }
}

async function acquireLock() {
  mkdirSync(tempDir, { recursive: true });

  while (true) {
    try {
      mkdirSync(lockDir);
      writeFileSync(
        path.join(lockDir, "owner"),
        JSON.stringify(
          {
            pid: process.pid,
            startedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
      return;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      removeStaleLockIfNeeded();
      await sleep(250);
    }
  }
}

function removeStaleLockIfNeeded() {
  try {
    const lock = statSync(lockDir);
    if (Date.now() - lock.mtimeMs > staleLockMs) {
      rmSync(lockDir, { force: true, recursive: true });
    }
  } catch {
    // Another process may have released the lock between mkdir and stat.
  }
}

function run(command, args) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlreadyExistsError(error) {
  return error && typeof error === "object" && "code" in error && error.code === "EEXIST";
}

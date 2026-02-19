#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const packageJsonPath = path.join(repoRoot, "package.json");
const appConfigPath = path.join(repoRoot, "app.config.ts");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function bumpPatch(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return `${major}.${minor}.${patch + 1}`;
}

function updatePackageJson(nextVersion) {
  const pkg = readJson(packageJsonPath);
  pkg.version = nextVersion;
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(pkg, null, 2)}\n`,
    "utf8",
  );
}

function updateAppConfig(nextVersion) {
  const content = fs.readFileSync(appConfigPath, "utf8");
  const versionPattern = /version:\s*"(\d+\.\d+\.\d+)",/;
  const match = content.match(versionPattern);
  if (!match) {
    throw new Error("Unable to update version in app.config.ts");
  }

  if (match[1] === nextVersion) {
    return;
  }

  const updated = content.replace(versionPattern, `version: "${nextVersion}",`);

  fs.writeFileSync(appConfigPath, updated, "utf8");
}

function main() {
  const pkg = readJson(packageJsonPath);
  const nextVersion = bumpPatch(pkg.version);
  updatePackageJson(nextVersion);
  updateAppConfig(nextVersion);
}

main();

#!/usr/bin/env node
/**
 * Semantic Versioning & Automated Release Tagging Script
 *
 * Usage:
 *   node scripts/bump-version.mjs <patch|minor|major|x.y.z> [--git] [--no-tag]
 *
 * Updates package.json + app.json version in lockstep, prepends release notes
 * to CHANGELOG.md, and (when --git is passed) commits & creates annotated tag vX.Y.Z
 * ready to trigger `.github/workflows/release-ios-ipa.yml`.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const pkgPath = path.join(rootDir, 'package.json');
const appJsonPath = path.join(rootDir, 'app.json');
const changelogPath = path.join(rootDir, 'CHANGELOG.md');

export function computeNextVersion(current, bumpOrExplicit) {
  if (/^\d+\.\d+\.\d+$/.test(bumpOrExplicit)) {
    return bumpOrExplicit;
  }
  const parts = current.split('.').map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid current semantic version: ${current}`);
  }
  const [major, minor, patch] = parts;
  switch (bumpOrExplicit) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unknown bump type "${bumpOrExplicit}". Expected patch, minor, major, or X.Y.Z.`);
  }
}

function collectRecentCommits() {
  try {
    const lastTag = execSync('git describe --tags --abbrev=0', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const log = execSync(`git log ${lastTag}..HEAD --pretty=format:"- %s (%h)"`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return log || '- Maintenance and stability improvements';
  } catch {
    try {
      const log = execSync('git log -n 15 --pretty=format:"- %s (%h)"', {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
      return log || '- Initial release';
    } catch {
      return '- Release update';
    }
  }
}

function runCli() {
  const args = process.argv.slice(2);
  const bumpArg = args.find((a) => !a.startsWith('--')) || 'patch';
  const doGit = args.includes('--git');
  const skipTag = args.includes('--no-tag');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const nextVersion = computeNextVersion(pkg.version, bumpArg);

  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  if (fs.existsSync(appJsonPath)) {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    if (appJson.expo) {
      appJson.expo.version = nextVersion;
    }
    fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`, 'utf8');
  }

  const today = new Date().toISOString().slice(0, 10);
  const notes = collectRecentCommits();
  const entry = `## [v${nextVersion}] - ${today}\n\n${notes}\n\n`;

  const existingChangelog = fs.existsSync(changelogPath)
    ? fs.readFileSync(changelogPath, 'utf8')
    : '# Changelog\n\nAll notable changes to Recipe Tracker iOS are documented in this file.\n\n';

  const headerEndIdx = existingChangelog.indexOf('## [');
  const updatedChangelog =
    headerEndIdx >= 0
      ? `${existingChangelog.slice(0, headerEndIdx)}${entry}${existingChangelog.slice(headerEndIdx)}`
      : `${existingChangelog.trimEnd()}\n\n${entry}`;

  fs.writeFileSync(changelogPath, updatedChangelog, 'utf8');

  console.log(`Updated version -> v${nextVersion}`);

  if (doGit) {
    execSync('git add package.json app.json CHANGELOG.md', { stdio: 'inherit' });
    execSync(`git commit -m "chore(release): v${nextVersion}"`, { stdio: 'inherit' });
    if (!skipTag) {
      execSync(`git tag -a v${nextVersion} -m "Release v${nextVersion}"`, { stdio: 'inherit' });
      console.log(`Created git tag v${nextVersion}. Push with: git push origin main --follow-tags`);
    }
  }
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(rootDir, 'scripts/bump-version.mjs');

if (isMainModule) {
  runCli();
}

import { execSync } from 'node:child_process';
import { ConfigContext, ExpoConfig } from 'expo/config';
import pkg from './package.json';

function getGitShortSha(): string {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'local';
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const bundleId =
    process.env.IOS_BUNDLE_IDENTIFIER ||
    config.ios?.bundleIdentifier ||
    'com.chena.recipetracker';

  const buildNumber =
    process.env.IOS_BUILD_NUMBER ||
    config.ios?.buildNumber ||
    '1';

  const easProjectId =
    process.env.EAS_PROJECT_ID ||
    (config.extra?.eas as { projectId?: string } | undefined)?.projectId;

  return {
    ...config,
    name: config.name ?? 'Recipe Tracker',
    slug: config.slug ?? 'recipe-tracker',
    version: pkg.version,
    ios: {
      ...config.ios,
      supportsTablet: true,
      bundleIdentifier: bundleId,
      buildNumber: String(buildNumber),
      infoPlist: {
        ...config.ios?.infoPlist,
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      ...config.android,
      package: bundleId,
    },
    extra: {
      ...config.extra,
      gitCommitSha: getGitShortSha(),
      buildTimestamp: new Date().toISOString(),
      releaseChannel: process.env.EAS_BUILD_PROFILE ?? (process.env.CI ? 'release' : 'development'),
      ...(easProjectId
        ? {
            eas: {
              ...(config.extra?.eas as Record<string, unknown> | undefined),
              projectId: easProjectId,
            },
          }
        : {}),
    },
  };
};

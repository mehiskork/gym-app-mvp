const {
  createRunOncePlugin,
  withAppBuildGradle,
  withGradleProperties,
} = require('expo/config-plugins');

function withAndroidR8Optimization(config) {
  config = withAppBuildGradle(config, (nextConfig) => {
    // Match the known Expo template directive, not comments or arbitrary Gradle code.
    // Accept the optimised version too, so repeated prebuilds are idempotent.
    const directive =
      /^([ \t]*proguardFiles\s+getDefaultProguardFile\(\s*)(["'])proguard-android(?:-optimize)?\.txt\2(\s*\),\s*["']proguard-rules\.pro["'][ \t]*\r?)$/gm;
    if (
      nextConfig.modResults.language !== 'groovy' ||
      [...nextConfig.modResults.contents.matchAll(directive)].length !== 1
    ) {
      throw new Error(
        'withAndroidR8Optimization: expected one Expo release proguardFiles directive in app/build.gradle. Review the Android template before updating this plugin.',
      );
    }
    nextConfig.modResults.contents = nextConfig.modResults.contents.replace(
      directive,
      '$1$2proguard-android-optimize.txt$2$3',
    );
    return nextConfig;
  });

  return withGradleProperties(config, (nextConfig) => {
    // AGP 8.12/8.13 require this opt-in in addition to shrinkResources=true.
    // AGP 9 enables the pipeline by default; reassess this plugin on SDK upgrades.
    const key = 'android.r8.optimizedResourceShrinking';
    let found = false;
    nextConfig.modResults = nextConfig.modResults.filter((entry) => {
      if (entry.type !== 'property' || entry.key !== key) return true;
      if (found) return false;
      entry.value = 'true';
      found = true;
      return true;
    });
    if (!found) nextConfig.modResults.push({ type: 'property', key, value: 'true' });
    return nextConfig;
  });
}

module.exports = createRunOncePlugin(
  withAndroidR8Optimization,
  'with-android-r8-optimization',
  '1.0.0',
);

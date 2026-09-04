import appConfig from '../../../app.json';

describe('Android release optimization config', () => {
  it('enables R8 minification and resource shrinking for release builds', () => {
    const buildPropertiesPlugin = appConfig.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );

    expect(buildPropertiesPlugin).toEqual([
      'expo-build-properties',
      {
        android: {
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ]);
  });
});

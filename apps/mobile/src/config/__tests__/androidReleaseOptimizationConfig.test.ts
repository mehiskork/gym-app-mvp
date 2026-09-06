import appConfig from '../../../app.json';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileModsAsync, withPlugins } from 'expo/config-plugins';

const mobileRoot = path.resolve(__dirname, '../../..');
const template = path.join(mobileRoot, 'node_modules/expo/template.tgz');
const templateGradle = execFileSync('tar', [
  '-xOzf',
  template,
  'package/android/app/build.gradle',
]).toString();

describe('Generated Android R8 configuration', () => {
  let projectRoot: string;
  let gradlePath: string;
  let propertiesPath: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trainframe-r8-test-'));
    execFileSync('tar', ['-xzf', template, '--strip-components=1', '-C', projectRoot]);
    gradlePath = path.join(projectRoot, 'android/app/build.gradle');
    propertiesPath = path.join(projectRoot, 'android/gradle.properties');
    fs.writeFileSync(gradlePath, templateGradle);
    fs.writeFileSync(propertiesPath, '# Preserve other settings\norg.gradle.parallel=true\n');
  });

  afterEach(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  async function generate() {
    // Use the actual plugins registered by the app and Expo's real file providers.
    const buildProperties = appConfig.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === 'expo-build-properties',
    ) as [string, Record<string, unknown>];
    const r8Plugin = appConfig.expo.plugins.find(
      (entry) => entry === './plugins/withAndroidR8Optimization',
    ) as string;
    expect(r8Plugin).toBeDefined();
    const config = withPlugins(
      { name: 'R8 test', slug: 'r8-test', _internal: { projectRoot: mobileRoot } },
      [buildProperties, path.resolve(mobileRoot, r8Plugin)],
    );
    await compileModsAsync(config, { projectRoot, platforms: ['android'] });
  }

  it('enables optimization in the installed Expo template and preserves keep rules', async () => {
    await generate();
    const gradle = fs.readFileSync(gradlePath, 'utf8');
    expect(gradle).toContain('getDefaultProguardFile("proguard-android-optimize.txt")');
    expect(gradle).not.toContain('getDefaultProguardFile("proguard-android.txt")');
    expect(gradle).toContain(', "proguard-rules.pro"');
    expect(gradle).toContain('minifyEnabled enableMinifyInReleaseBuilds');
    expect(gradle).toContain('shrinkResources enableShrinkResources.toBoolean()');
    const properties = fs.readFileSync(propertiesPath, 'utf8');
    expect(properties).toContain('android.enableMinifyInReleaseBuilds=true');
    expect(properties).toContain('android.enableShrinkResourcesInReleaseBuilds=true');
    expect(properties).toContain('android.r8.optimizedResourceShrinking=true');
    expect(properties).toContain('# Preserve other settings');
    expect(properties).toContain('org.gradle.parallel=true');
  });

  it('replaces conflicting resource flags and leaves repeated prebuilds unchanged', async () => {
    fs.appendFileSync(
      propertiesPath,
      'android.r8.optimizedResourceShrinking=false\nandroid.r8.optimizedResourceShrinking=true\n',
    );
    await generate();
    const gradle = fs.readFileSync(gradlePath, 'utf8');
    const properties = fs.readFileSync(propertiesPath, 'utf8');
    expect(properties.match(/^android.r8.optimizedResourceShrinking=/gm)).toHaveLength(1);
    expect(properties).toContain('android.r8.optimizedResourceShrinking=true');
    await generate();
    expect(fs.readFileSync(gradlePath, 'utf8')).toBe(gradle);
    expect(fs.readFileSync(propertiesPath, 'utf8')).toBe(properties);
  });

  it('fails instead of silently skipping an unfamiliar template', async () => {
    fs.writeFileSync(gradlePath, templateGradle.replace(/proguardFiles/g, '// proguardFiles'));
    await expect(generate()).rejects.toThrow('expected one Expo release proguardFiles');
  });

  it('rejects ambiguous ProGuard directives', async () => {
    fs.appendFileSync(
      gradlePath,
      '\nproguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"\n',
    );
    await expect(generate()).rejects.toThrow('expected one Expo release proguardFiles');
  });

  it('requires review if the template switches to Kotlin Gradle', async () => {
    fs.renameSync(gradlePath, `${gradlePath}.kts`);
    await expect(generate()).rejects.toThrow('expected one Expo release proguardFiles');
  });
});

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

import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../../..');

function readMobileFile(relativePath: string): string {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

function readMobileFileIfExists(relativePath: string): string | null {
  const filePath = path.join(mobileRoot, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

describe('Android backup release config', () => {
  it('disables Android backup in Expo and native Android config', () => {
    const appJson = JSON.parse(readMobileFile('app.json')) as {
      expo?: { android?: { allowBackup?: boolean }; plugins?: string[] };
    };
    const plugin = readMobileFile('plugins/withAndroidBackupDisabled.js');
    const manifest = readMobileFileIfExists('android/app/src/main/AndroidManifest.xml');

    expect(appJson.expo?.android?.allowBackup).toBe(false);
    expect(appJson.expo?.plugins).toContain('./plugins/withAndroidBackupDisabled');
    expect(plugin).toContain("mainApplication.$['android:allowBackup'] = 'false'");
    expect(plugin).toContain(
      "mainApplication.$['android:fullBackupContent'] = '@xml/backup_rules'",
    );
    expect(plugin).toContain(
      "mainApplication.$['android:dataExtractionRules'] = '@xml/data_extraction_rules'",
    );
    if (manifest) {
      expect(manifest).toContain('android:allowBackup="false"');
      expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"');
      expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    }
  });

  it('generates exclude-only backup rules for legacy and Android 12+ backup paths', () => {
    const plugin = readMobileFile('plugins/withAndroidBackupDisabled.js');
    const backupRules =
      readMobileFileIfExists('android/app/src/main/res/xml/backup_rules.xml') ?? plugin;
    const dataExtractionRules =
      readMobileFileIfExists('android/app/src/main/res/xml/data_extraction_rules.xml') ?? plugin;

    expect(plugin).not.toContain('<include');

    expect(backupRules).toContain('<exclude domain="database" path="."/>');
    expect(backupRules).toContain('<exclude domain="sharedpref" path="."/>');
    expect(backupRules).not.toContain('<include');

    expect(dataExtractionRules).toContain('<cloud-backup>');
    expect(dataExtractionRules).toContain('<device-transfer>');
    expect(dataExtractionRules).toContain('<exclude domain="database" path="."/>');
    expect(dataExtractionRules).toContain('<exclude domain="sharedpref" path="."/>');
    expect(dataExtractionRules).not.toContain('<include');
  });
});

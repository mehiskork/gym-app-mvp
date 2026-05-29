const fs = require('node:fs/promises');
const path = require('node:path');

const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
} = require('expo/config-plugins');

const BACKUP_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="root" path="."/>
  <exclude domain="file" path="."/>
  <exclude domain="database" path="."/>
  <exclude domain="sharedpref" path="."/>
  <exclude domain="external" path="."/>
  <exclude domain="device_root" path="."/>
  <exclude domain="device_file" path="."/>
  <exclude domain="device_database" path="."/>
  <exclude domain="device_sharedpref" path="."/>
</full-backup-content>
`;

const DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="root" path="."/>
    <exclude domain="file" path="."/>
    <exclude domain="database" path="."/>
    <exclude domain="sharedpref" path="."/>
    <exclude domain="external" path="."/>
    <exclude domain="device_root" path="."/>
    <exclude domain="device_file" path="."/>
    <exclude domain="device_database" path="."/>
    <exclude domain="device_sharedpref" path="."/>
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" path="."/>
    <exclude domain="file" path="."/>
    <exclude domain="database" path="."/>
    <exclude domain="sharedpref" path="."/>
    <exclude domain="external" path="."/>
    <exclude domain="device_root" path="."/>
    <exclude domain="device_file" path="."/>
    <exclude domain="device_database" path="."/>
    <exclude domain="device_sharedpref" path="."/>
  </device-transfer>
</data-extraction-rules>
`;

function withAndroidBackupDisabled(config) {
  config.android = {
    ...config.android,
    allowBackup: false,
  };

  config = withAndroidManifest(config, (nextConfig) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplication(nextConfig.modResults);
    if (mainApplication?.$) {
      mainApplication.$['android:allowBackup'] = 'false';
      mainApplication.$['android:fullBackupContent'] = '@xml/backup_rules';
      mainApplication.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    }
    return nextConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (nextConfig) => {
      const xmlDir = path.join(
        nextConfig.modRequest.platformProjectRoot,
        'app/src/main/res/xml',
      );
      await fs.mkdir(xmlDir, { recursive: true });
      await fs.writeFile(path.join(xmlDir, 'backup_rules.xml'), BACKUP_RULES_XML);
      await fs.writeFile(
        path.join(xmlDir, 'data_extraction_rules.xml'),
        DATA_EXTRACTION_RULES_XML,
      );
      return nextConfig;
    },
  ]);
}

module.exports = createRunOncePlugin(
  withAndroidBackupDisabled,
  'with-android-backup-disabled',
  '1.0.0',
);

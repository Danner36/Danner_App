const { withAndroidManifest } = require('@expo/config-plugins');

const NEARBY_WIFI = 'android.permission.NEARBY_WIFI_DEVICES';

function withGoogleCastNative(config) {
  return withAndroidManifest(config, (config) => {
    const permissions = config.modResults.manifest['uses-permission'] || [];
    let found = false;
    for (const permission of permissions) {
      if (permission.$?.['android:name'] === NEARBY_WIFI) {
        permission.$['android:usesPermissionFlags'] = 'neverForLocation';
        found = true;
      }
    }
    if (!found) {
      permissions.push({
        $: {
          'android:name': NEARBY_WIFI,
          'android:usesPermissionFlags': 'neverForLocation',
        },
      });
    }
    config.modResults.manifest['uses-permission'] = permissions;
    return config;
  });
}

module.exports = withGoogleCastNative;

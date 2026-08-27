const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withMainActivity,
} = require('@expo/config-plugins');
const { addImports } = require('@expo/config-plugins/build/android/codeMod');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const META_PROVIDER = 'com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME';
const META_RECEIVER = 'com.reactnative.googlecast.RECEIVER_APPLICATION_ID';
const PROVIDER_CLASS = 'com.reactnative.googlecast.GoogleCastOptionsProvider';
const RECEIVER_ID = 'CC1AD845';

function withGoogleCastNative(config) {
  config = withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      META_PROVIDER,
      PROVIDER_CLASS
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      META_RECEIVER,
      RECEIVER_ID
    );

    const permissions = config.modResults.manifest['uses-permission'] || [];
    for (const permission of permissions) {
      if (permission.$?.['android:name'] === 'android.permission.NEARBY_WIFI_DEVICES') {
        delete permission.$['android:usesPermissionFlags'];
      }
    }
    return config;
  });

  config = withMainActivity(config, (config) => {
    let src = addImports(
      config.modResults.contents,
      ['com.reactnative.googlecast.api.RNGCCastContext'],
      config.modResults.language === 'java'
    );
    if (!src.includes('RNGCCastContext.getSharedInstance')) {
      src = mergeContents({
        tag: 'danner-google-cast-onCreate',
        src,
        newSrc: '    RNGCCastContext.getSharedInstance(this)',
        anchor: /super\.onCreate\(\w+\)/,
        offset: 1,
        comment: '//',
      }).contents;
    }
    config.modResults.contents = src;
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    if (
      config.modResults.language === 'groovy' &&
      !config.modResults.contents.includes('play-services-cast-framework')
    ) {
      config.modResults.contents = mergeContents({
        tag: 'danner-google-cast-dependencies',
        src: config.modResults.contents,
        newSrc:
          '    implementation "com.google.android.gms:play-services-cast-framework:+"',
        anchor: /dependencies(?:\s+)?\{/,
        offset: 1,
        comment: '//',
      }).contents;
    }
    return config;
  });

  return config;
}

module.exports = withGoogleCastNative;

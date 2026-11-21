/**
 * Expo Config Plugin for rn-perf-kit native module.
 * Enables zero-config setup in managed and bare Expo projects.
 */

const { withDangerousMod, withPlugins } = require('@expo/config-plugins');

function withRnPerfKitAndroid(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      // Custom Android project modifications if required
      return modConfig;
    },
  ]);
}

function withRnPerfKit(config) {
  return withPlugins(config, [withRnPerfKitAndroid]);
}

module.exports = withRnPerfKit;

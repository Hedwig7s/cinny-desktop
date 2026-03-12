'use strict';

/**
 * scripts/notarize.js
 *
 * Called by electron-builder's `afterSign` hook on macOS.
 * Requires environment variables:
 *   APPLE_ID            – your Apple ID email
 *   APPLE_APP_SPECIFIC_PASSWORD – an app-specific password from appleid.apple.com
 *   APPLE_TEAM_ID       – your Apple Developer Team ID
 *
 * Install: npm install --save-dev @electron/notarize
 */

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;

  if (!process.env.APPLE_ID) {
    console.warn('Skipping notarization: APPLE_ID not set.');
    return;
  }

  console.log(`Notarizing ${appName}…`);

  await notarize({
    tool:     'notarytool',
    appPath:  `${appOutDir}/${appName}.app`,
    appleId:             process.env.APPLE_ID,
    appleIdPassword:     process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId:              process.env.APPLE_TEAM_ID,
  });

  console.log('Notarization complete.');
};

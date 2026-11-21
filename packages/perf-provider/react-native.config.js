module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.rnperfkit.RnPerfKitPackage;',
        packageInstance: 'new RnPerfKitPackage()',
      },
      ios: {},
    },
  },
};

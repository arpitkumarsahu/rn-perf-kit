#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

#ifdef RCT_NEW_ARCH_ENABLED
#import <RnPerfKitSpec/RnPerfKitSpec.h>
@interface RnPerfKit : NSObject <NativeRnPerfKitSpec>
#else
@interface RnPerfKit : NSObject <RCTBridgeModule>
#endif

@end

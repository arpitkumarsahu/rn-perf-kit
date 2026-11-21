#import "RnPerfKit.h"
#import <QuartzCore/QuartzCore.h>
#import <mach/mach.h>
#import <sys/utsname.h>

@implementation RnPerfKit {
  CADisplayLink *_displayLink;
  RCTResponseSenderBlock _frameCallback;
  CFTimeInterval _lastFrameTimestamp;
}

RCT_EXPORT_MODULE(RnPerfKit)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

// ── Clock Synchronization ───────────────────────────────────────────────────

RCT_EXPORT_METHOD(nativeNow:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  // CACurrentMediaTime() returns seconds since boot with microsecond resolution.
  double ms = CACurrentMediaTime() * 1000.0;
  resolve(@(ms));
}

- (NSNumber *)nativeNowSync {
  return @(CACurrentMediaTime() * 1000.0);
}

// ── Device Information & Tier ───────────────────────────────────────────────

RCT_EXPORT_METHOD(getDeviceInfo:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  uint64_t physicalMemory = [NSProcessInfo processInfo].physicalMemory;
  int totalRamMb = (int)(physicalMemory / 1024 / 1024);
  int cpuCores = (int)[[NSProcessInfo processInfo] activeProcessorCount];
  
  UIScreen *mainScreen = [UIScreen mainScreen];
  int refreshRateHz = 60;
  if (@available(iOS 10.3, *)) {
    refreshRateHz = (int)mainScreen.maximumFramesPerSecond;
  }

  // Device tier classification:
  // LOW: <= 3GB RAM (older iPhones e.g. iPhone 8, XR, SE 2nd gen)
  // HIGH: >= 6GB RAM (iPhone 12 Pro, 13 Pro, 14 Pro, 15, etc.)
  // MID: 4GB RAM (iPhone 11, 12, 13 base)
  NSString *tier = @"MID";
  if (totalRamMb <= 3200) {
    tier = @"LOW";
  } else if (totalRamMb >= 5800) {
    tier = @"HIGH";
  }

  resolve(@{
    @"tier": tier,
    @"totalRamMb": @(totalRamMb),
    @"cpuCores": @(cpuCores),
    @"refreshRateHz": @(refreshRateHz),
    @"isLowRamDevice": totalRamMb <= 3200 ? @YES : @NO,
    @"os": @"ios",
    @"osVersion": [[UIDevice currentDevice] systemVersion]
  });
}

// ── Memory Monitoring ───────────────────────────────────────────────────────

RCT_EXPORT_METHOD(getMemorySnapshot:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  struct mach_task_basic_info info;
  mach_msg_type_number_t count = MACH_TASK_BASIC_INFO_COUNT;
  
  if (task_info(mach_task_self(), MACH_TASK_BASIC_INFO, (task_info_t)&info, &count) == KERN_SUCCESS) {
    int usedMb = (int)(info.resident_size / 1024 / 1024);
    uint64_t totalRam = [NSProcessInfo processInfo].physicalMemory;
    int totalMb = (int)(totalRam / 1024 / 1024);
    int availableMb = MAX(0, totalMb - usedMb);

    resolve(@{
      @"t": @(CACurrentMediaTime() * 1000.0),
      @"usedMb": @(usedMb),
      @"availableMb": @(availableMb)
    });
  } else {
    reject(@"MEMORY_ERROR", @"Unable to retrieve task_info", nil);
  }
}

// ── Thermal Monitoring ──────────────────────────────────────────────────────

RCT_EXPORT_METHOD(getThermalStatus:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
  NSProcessInfoThermalState state = [NSProcessInfo processInfo].thermalState;
  NSString *statusString = @"none";

  switch (state) {
    case NSProcessInfoThermalStateNominal:
      statusString = @"none";
      break;
    case NSProcessInfoThermalStateFair:
      statusString = @"light";
      break;
    case NSProcessInfoThermalStateSerious:
      statusString = @"severe";
      break;
    case NSProcessInfoThermalStateCritical:
      statusString = @"critical";
      break;
  }

  resolve(@{
    @"t": @(CACurrentMediaTime() * 1000.0),
    @"status": statusString
  });
}

// ── CADisplayLink Frame Monitoring ──────────────────────────────────────────

RCT_EXPORT_METHOD(startFrameCollection:(RCTResponseSenderBlock)onFrame) {
  dispatch_async(dispatch_get_main_queue(), ^{
    self->_frameCallback = onFrame;
    if (!self->_displayLink) {
      self->_displayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(onDisplayLinkTick:)];
      [self->_displayLink addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
      self->_lastFrameTimestamp = 0;
    }
  });
}

RCT_EXPORT_METHOD(stopFrameCollection) {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self->_displayLink) {
      [self->_displayLink invalidate];
      self->_displayLink = nil;
    }
    self->_frameCallback = nil;
  });
}

- (void)onDisplayLinkTick:(CADisplayLink *)link {
  CFTimeInterval current = link.timestamp;
  if (_lastFrameTimestamp > 0) {
    CFTimeInterval duration = current - _lastFrameTimestamp;
    double durationMs = duration * 1000.0;
    CFTimeInterval targetDuration = link.targetTimestamp - current;
    double targetDurationMs = (targetDuration > 0 ? targetDuration : (1.0 / 60.0)) * 1000.0;
    
    // Jank threshold: frame duration > 1.5x expected vsync budget
    BOOL isJanky = durationMs > (targetDurationMs * 1.5);
    
    if (_frameCallback) {
      _frameCallback(@[@{
        @"t": @(current * 1000.0),
        @"dur": @(durationMs),
        @"janky": @(isJanky)
      }]);
    }
  }
  _lastFrameTimestamp = current;
}

// ── File Export ─────────────────────────────────────────────────────────────

RCT_EXPORT_METHOD(writeSessionFile:(NSString *)path
                              json:(NSString *)json
                          resolver:(RCTPromiseResolveBlock)resolve
                          rejecter:(RCTPromiseRejectBlock)reject) {
  NSError *error = nil;
  BOOL success = [json writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:&error];
  if (success) {
    resolve(nil);
  } else {
    reject(@"WRITE_ERROR", error.localizedDescription, error);
  }
}

// Stubs for TurboModule compliance
RCT_EXPORT_METHOD(startMemoryMonitoring:(RCTResponseSenderBlock)onTrim) {}
RCT_EXPORT_METHOD(stopMemoryMonitoring) {}
RCT_EXPORT_METHOD(startThermalMonitoring:(RCTResponseSenderBlock)onThermal) {}
RCT_EXPORT_METHOD(stopThermalMonitoring) {}

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeRnPerfKitSpecJSI>(params);
}
#endif

@end

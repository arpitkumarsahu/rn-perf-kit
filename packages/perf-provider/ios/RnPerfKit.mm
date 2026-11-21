#import "RnPerfKit.h"
#import <QuartzCore/QuartzCore.h>
#import <mach/mach.h>
#import <os/proc.h>
#import <UIKit/UIKit.h>

@implementation RnPerfKit {
  CADisplayLink *_displayLink;
  CFTimeInterval _lastTs;
  CFTimeInterval _lastFlush;
  NSMutableArray<NSDictionary *> *_pending;
  id _memoryObserver;
  id _thermalObserver;
}

RCT_EXPORT_MODULE(RnPerfKit)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (NSNumber *)nativeNow {
  return @(CACurrentMediaTime() * 1000.0);
}

- (NSDictionary *)getDeviceInfo {
  NSProcessInfo *p = [NSProcessInfo processInfo];
  int refreshRate = 60;
  if (@available(iOS 10.3, *)) {
    refreshRate = (int)[UIScreen mainScreen].maximumFramesPerSecond;
  }
  return @{
    @"totalRamMb": @((int)(p.physicalMemory / 1024 / 1024)),
    @"cpuCores": @((int)p.activeProcessorCount),
    @"refreshRateHz": @(refreshRate),
    @"isLowRamDevice": @NO,
    @"os": @"ios",
    @"osVersion": [[UIDevice currentDevice] systemVersion],
    @"mediaPerformanceClass": @(-1),
  };
}

- (NSDictionary *)getMemorySnapshot {
  struct mach_task_basic_info info;
  mach_msg_type_number_t count = MACH_TASK_BASIC_INFO_COUNT;
  int usedMb = 0;
  int availableMb = 0;
  
  // usedMb = this app's resident memory (same meaning as Android's RSS).
  if (task_info(mach_task_self(), MACH_TASK_BASIC_INFO, (task_info_t)&info, &count) == KERN_SUCCESS) {
    usedMb = (int)(info.resident_size / 1024 / 1024);
  }
  // availableMb = how much more this app can allocate before iOS kills it (iOS 13+).
  availableMb = (int)(os_proc_available_memory() / 1024 / 1024);

  return @{
    @"t": @(CACurrentMediaTime() * 1000.0),
    @"usedMb": @(usedMb),
    @"availableMb": @(availableMb),
    @"trimLevel": @(0)
  };
}

- (NSDictionary *)getThermalStatus {
  NSProcessInfoThermalState state = [NSProcessInfo processInfo].thermalState;
  NSString *statusString = @"none";
  switch (state) {
    case NSProcessInfoThermalStateNominal: statusString = @"none"; break;
    case NSProcessInfoThermalStateFair: statusString = @"light"; break;
    case NSProcessInfoThermalStateSerious: statusString = @"severe"; break;
    case NSProcessInfoThermalStateCritical: statusString = @"critical"; break;
  }
  return @{
    @"t": @(CACurrentMediaTime() * 1000.0),
    @"status": statusString
  };
}

- (void)startFrameCollection {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self->_displayLink) return;
    self->_pending = [NSMutableArray new];
    self->_lastTs = 0;
    self->_lastFlush = CACurrentMediaTime();
    self->_displayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(onTick:)];
    [self->_displayLink addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
  });
}

- (void)onTick:(CADisplayLink *)link {
  CFTimeInterval now = link.timestamp;
  if (_lastTs > 0) {
    double durMs = (now - _lastTs) * 1000.0;
    double budgetMs = (link.targetTimestamp - link.timestamp) * 1000.0;
    if (budgetMs <= 0) budgetMs = 1000.0 / 60.0;
    BOOL janky = durMs > (budgetMs * 1.5);
    [_pending addObject:@{
      @"t": @(_lastTs * 1000.0),
      @"dur": @(durMs),
      @"janky": @(janky)
    }];
  }
  _lastTs = now;
  if (now - _lastFlush >= 0.25 && _pending.count > 0) {
    NSArray *frames = _pending;
    _pending = [NSMutableArray new];
    _lastFlush = now;
    [self emitOnFrames:@{ @"frames": frames }];
  }
}

- (void)stopFrameCollection {
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self->_displayLink) {
      [self->_displayLink invalidate];
      self->_displayLink = nil;
    }
  });
}

- (void)startMemoryMonitoring {
  __weak typeof(self) weakSelf = self;
  _memoryObserver = [[NSNotificationCenter defaultCenter]
    addObserverForName:UIApplicationDidReceiveMemoryWarningNotification
    object:nil
    queue:[NSOperationQueue mainQueue]
    usingBlock:^(NSNotification * _Nonnull note) {
      __strong typeof(weakSelf) strongSelf = weakSelf;
      if (strongSelf) {
        NSMutableDictionary *snap = [[strongSelf getMemorySnapshot] mutableCopy];
        snap[@"trimLevel"] = @(1);
        [strongSelf emitOnMemoryTrim:snap];
      }
    }];
}

- (void)stopMemoryMonitoring {
  if (_memoryObserver) {
    [[NSNotificationCenter defaultCenter] removeObserver:_memoryObserver];
    _memoryObserver = nil;
  }
}

- (void)startThermalMonitoring {
  __weak typeof(self) weakSelf = self;
  _thermalObserver = [[NSNotificationCenter defaultCenter]
    addObserverForName:NSProcessInfoThermalStateDidChangeNotification
    object:nil
    queue:[NSOperationQueue mainQueue]
    usingBlock:^(NSNotification * _Nonnull note) {
      __strong typeof(weakSelf) strongSelf = weakSelf;
      if (strongSelf) {
        [strongSelf emitOnThermal:[strongSelf getThermalStatus]];
      }
    }];
}

- (void)stopThermalMonitoring {
  if (_thermalObserver) {
    [[NSNotificationCenter defaultCenter] removeObserver:_thermalObserver];
    _thermalObserver = nil;
  }
}

- (void)writeSessionFile:(NSString *)path
                    json:(NSString *)json
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject {
  NSError *error = nil;
  BOOL success = [json writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:&error];
  if (success) {
    resolve(nil);
  } else {
    reject(@"WRITE_ERROR", error.localizedDescription, error);
  }
}

- (void)invalidate {
  [self stopFrameCollection];
  [self stopMemoryMonitoring];
  [self stopThermalMonitoring];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeRnPerfKitSpecJSI>(params);
}

@end

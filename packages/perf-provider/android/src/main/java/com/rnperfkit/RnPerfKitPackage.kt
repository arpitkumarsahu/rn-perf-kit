package com.rnperfkit

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class RnPerfKitPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == RnPerfKitModule.NAME) RnPerfKitModule(reactContext) else null

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
        mapOf(
            RnPerfKitModule.NAME to ReactModuleInfo(
                RnPerfKitModule.NAME, RnPerfKitModule.NAME,
                false, false, false, true
            )
        )
    }
}

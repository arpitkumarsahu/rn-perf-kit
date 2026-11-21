package com.rnperfkit

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = RnPerfKitModule.NAME)
class RnPerfKitModule(reactContext: ReactApplicationContext) :
    NativeRnPerfKitSpec(reactContext) {

    companion object {
        const val NAME = "RnPerfKit"
        private const val TAG = "RnPerfKit"
    }

    override fun getName(): String = NAME

    override fun nativeNow(): Double = SystemClock.elapsedRealtime().toDouble()

    override fun getDeviceInfo(): WritableMap {
        val ctx = reactApplicationContext
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mi = ActivityManager.MemoryInfo()
        am.getMemoryInfo(mi)
        val totalRamMb = (mi.totalMem / 1024 / 1024).toInt()
        val cpuCores = Runtime.getRuntime().availableProcessors()
        val isLowRam = am.isLowRamDevice
        val mediaPerf = if (Build.VERSION.SDK_INT >= 31) Build.VERSION.MEDIA_PERFORMANCE_CLASS else -1
        val refreshRate = if (Build.VERSION.SDK_INT >= 30) ctx.display?.refreshRate?.toInt() ?: 60 else 60
        val tier = when {
            isLowRam || totalRamMb < 3000 || cpuCores <= 4 -> "LOW"
            totalRamMb >= 6000 && cpuCores >= 8 && mediaPerf >= 31 -> "HIGH"
            else -> "MID"
        }
        return Arguments.createMap().apply {
            putString("tier", tier)
            putInt("totalRamMb", totalRamMb)
            putInt("cpuCores", cpuCores)
            putInt("refreshRateHz", refreshRate)
            putBoolean("isLowRamDevice", isLowRam)
            putString("os", "android")
            putString("osVersion", Build.VERSION.RELEASE)
            if (mediaPerf >= 0) putInt("mediaPerformanceClass", mediaPerf)
        }
    }

    override fun getMemorySnapshot(): WritableMap {
        val ctx = reactApplicationContext
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mi = ActivityManager.MemoryInfo()
        am.getMemoryInfo(mi)
        return Arguments.createMap().apply {
            putDouble("t", nativeNow())
            putInt("usedMb", ((mi.totalMem - mi.availMem) / 1024 / 1024).toInt())
            putInt("availableMb", (mi.availMem / 1024 / 1024).toInt())
        }
    }

    override fun getThermalStatus(): WritableMap {
        val status = if (Build.VERSION.SDK_INT >= 29) {
            val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            when (pm.currentThermalStatus) {
                PowerManager.THERMAL_STATUS_NONE -> "none"
                PowerManager.THERMAL_STATUS_LIGHT -> "light"
                PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
                PowerManager.THERMAL_STATUS_SEVERE -> "severe"
                PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
                PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
                PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
                else -> "none"
            }
        } else "none"
        return Arguments.createMap().apply {
            putDouble("t", nativeNow())
            putString("status", status)
        }
    }

    private var frameCallback: Callback? = null

    override fun startFrameCollection(onFrame: Callback) {
        frameCallback = onFrame
        Log.d(TAG, "startFrameCollection: attach JankStats via RnPerfKitActivity")
    }

    override fun stopFrameCollection() {
        frameCallback = null
    }

    override fun startMemoryMonitoring(onTrim: Callback) {
        Log.d(TAG, "startMemoryMonitoring: stub")
    }

    override fun stopMemoryMonitoring() {}

    override fun startThermalMonitoring(onThermal: Callback) {
        Log.d(TAG, "startThermalMonitoring: stub")
    }

    override fun stopThermalMonitoring() {}

    override fun writeSessionFile(path: String, json: String, promise: Promise) {
        try {
            java.io.File(path).writeText(json)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("WRITE_ERROR", e.message, e)
        }
    }
}

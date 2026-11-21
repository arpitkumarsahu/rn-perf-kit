package com.rnperfkit

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import androidx.metrics.performance.JankStats
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = RnPerfKitModule.NAME)
class RnPerfKitModule(reactContext: ReactApplicationContext) :
    NativeRnPerfKitSpec(reactContext), LifecycleEventListener, ComponentCallbacks2 {

    companion object {
        const val NAME = "RnPerfKit"
    }

    private data class Frame(val startNs: Long, val durNs: Long, val jank: Boolean)

    private val main = Handler(Looper.getMainLooper())
    private val pending = ArrayList<Frame>()
    private var jankStats: JankStats? = null
    @Volatile private var collecting = false

    private var thermalListener: PowerManager.OnThermalStatusChangedListener? = null

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName() = NAME

    // Clock: System.nanoTime() to align with JankStats frameStartNanos
    override fun nativeNow(): Double = System.nanoTime() / 1_000_000.0

    override fun getDeviceInfo(): WritableMap {
        val ctx = reactApplicationContext
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        val mi = ActivityManager.MemoryInfo()
        am?.getMemoryInfo(mi)
        val totalRamMb = (mi.totalMem / 1024 / 1024).toInt()
        val cpuCores = Runtime.getRuntime().availableProcessors()
        val isLowRam = am?.isLowRamDevice ?: false
        val mediaPerf = if (Build.VERSION.SDK_INT >= 31) Build.VERSION.MEDIA_PERFORMANCE_CLASS else -1
        val refreshRate = if (Build.VERSION.SDK_INT >= 30) ctx.display?.refreshRate?.toInt() ?: 60 else 60

        return Arguments.createMap().apply {
            putInt("totalRamMb", totalRamMb)
            putInt("cpuCores", cpuCores)
            putInt("refreshRateHz", refreshRate)
            putBoolean("isLowRamDevice", isLowRam)
            putString("os", "android")
            putString("osVersion", Build.VERSION.RELEASE ?: "")
            putInt("mediaPerformanceClass", mediaPerf)
        }
    }

    override fun getMemorySnapshot(): WritableMap {
        val ctx = reactApplicationContext
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        val mi = ActivityManager.MemoryInfo()
        am?.getMemoryInfo(mi)
        val usedMb = ((mi.totalMem - mi.availMem) / 1024 / 1024).toInt()
        val availableMb = (mi.availMem / 1024 / 1024).toInt()
        return Arguments.createMap().apply {
            putDouble("t", nativeNow())
            putInt("usedMb", usedMb)
            putInt("availableMb", availableMb)
            putInt("trimLevel", 0)
        }
    }

    override fun getThermalStatus(): WritableMap {
        val status = if (Build.VERSION.SDK_INT >= 29) {
            val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            when (pm?.currentThermalStatus) {
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

    override fun startFrameCollection() {
        collecting = true
        main.post {
            attachJankStats()
            main.removeCallbacks(flush)
            main.postDelayed(flush, 250)
        }
    }

    override fun stopFrameCollection() {
        collecting = false
        main.post {
            jankStats?.isTrackingEnabled = false
            jankStats = null
            main.removeCallbacks(flush)
        }
    }

    private fun attachJankStats() {
        val window = reactApplicationContext.currentActivity?.window ?: return
        jankStats?.isTrackingEnabled = false
        try {
            jankStats = JankStats.createAndTrack(window) { f ->
                synchronized(pending) {
                    pending.add(Frame(f.frameStartNanos, f.frameDurationUiNanos, f.isJank))
                }
            }
        } catch (_: Exception) {}
    }

    private val flush = object : Runnable {
        override fun run() {
            val batch = synchronized(pending) {
                ArrayList(pending).also { pending.clear() }
            }
            if (batch.isNotEmpty()) {
                val frames = Arguments.createArray()
                batch.forEach { f ->
                    frames.pushMap(Arguments.createMap().apply {
                        putDouble("t", f.startNs / 1_000_000.0)
                        putDouble("dur", f.durNs / 1_000_000.0)
                        putBoolean("janky", f.jank)
                    })
                }
                emitOnFrames(Arguments.createMap().apply { putArray("frames", frames) })
            }
            if (collecting) {
                main.postDelayed(this, 250)
            }
        }
    }

    override fun startMemoryMonitoring() {
        reactApplicationContext.applicationContext?.registerComponentCallbacks(this)
    }

    override fun stopMemoryMonitoring() {
        try {
            reactApplicationContext.applicationContext?.unregisterComponentCallbacks(this)
        } catch (_: Exception) {}
    }

    override fun onTrimMemory(level: Int) {
        val snapshot = getMemorySnapshot().apply { putInt("trimLevel", level) }
        emitOnMemoryTrim(snapshot)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {}
    override fun onLowMemory() {
        onTrimMemory(ComponentCallbacks2.TRIM_MEMORY_COMPLETE)
    }

    override fun startThermalMonitoring() {
        if (Build.VERSION.SDK_INT >= 29) {
            val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            val listener = PowerManager.OnThermalStatusChangedListener { status ->
                val statusStr = when (status) {
                    PowerManager.THERMAL_STATUS_NONE -> "none"
                    PowerManager.THERMAL_STATUS_LIGHT -> "light"
                    PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
                    PowerManager.THERMAL_STATUS_SEVERE -> "severe"
                    PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
                    PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
                    PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
                    else -> "none"
                }
                emitOnThermal(Arguments.createMap().apply {
                    putDouble("t", nativeNow())
                    putString("status", statusStr)
                })
            }
            thermalListener = listener
            pm?.addThermalStatusListener(reactApplicationContext.mainExecutor, listener)
        }
    }

    override fun stopThermalMonitoring() {
        if (Build.VERSION.SDK_INT >= 29 && thermalListener != null) {
            val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            pm?.removeThermalStatusListener(thermalListener!!)
            thermalListener = null
        }
    }

    override fun writeSessionFile(path: String, json: String, promise: Promise) {
        try {
            java.io.File(path).writeText(json)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("WRITE_ERROR", e.message, e)
        }
    }

    override fun onHostResume() {
        if (collecting) main.post { attachJankStats() }
    }

    override fun onHostPause() {}

    override fun onHostDestroy() {
        jankStats?.isTrackingEnabled = false
        jankStats = null
    }

    override fun invalidate() {
        stopFrameCollection()
        stopMemoryMonitoring()
        stopThermalMonitoring()
        reactApplicationContext.removeLifecycleEventListener(this)
        super.invalidate()
    }
}

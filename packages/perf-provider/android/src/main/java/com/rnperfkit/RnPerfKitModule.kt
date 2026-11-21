package com.rnperfkit

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.hardware.display.DisplayManager
import android.view.Display
import androidx.metrics.performance.FrameDataApi31
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
        val refreshRate = getRefreshRate()

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

    // The application context has no display: Context.getDisplay() throws on API 30+.
    // Prefer the Activity's display (correct on multi-display devices), else the default one.
    private fun getRefreshRate(): Int {
        return try {
            val activityDisplay = if (Build.VERSION.SDK_INT >= 30) {
                reactApplicationContext.currentActivity?.display
            } else null
            val display = activityDisplay
                ?: (reactApplicationContext.getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager)
                    ?.getDisplay(Display.DEFAULT_DISPLAY)
            display?.refreshRate?.let { Math.round(it) } ?: 60
        } catch (_: Exception) {
            60
        }
    }

    // usedMb = this app's resident memory (RSS), same meaning as iOS resident_size.
    // availableMb = memory the system can still hand out.
    // /proc/self/statm is cheap, unlike Debug.getMemoryInfo() or the rate-limited
    // ActivityManager.getProcessMemoryInfo(), so this is safe to call from the JS thread.
    private fun readRssMb(): Int {
        return try {
            val pages = java.io.File("/proc/self/statm").readText().trim().split(" ")[1].toLong()
            val pageSize = android.system.Os.sysconf(android.system.OsConstants._SC_PAGESIZE)
            (pages * pageSize / 1024 / 1024).toInt()
        } catch (_: Exception) {
            0
        }
    }

    override fun getMemorySnapshot(): WritableMap {
        val ctx = reactApplicationContext
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        val mi = ActivityManager.MemoryInfo()
        am?.getMemoryInfo(mi)
        val usedMb = readRssMb()
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
                // API 31+: total frame time (UI + RenderThread + GPU) and whether the frame
                // missed its deadline, which is how Android's own frame stats (gfxinfo) count jank.
                // Older APIs only report UI-thread time, so fall back to JankStats' heuristic.
                val frame = if (f is FrameDataApi31) {
                    Frame(f.frameStartNanos, f.frameDurationTotalNanos, f.frameOverrunNanos > 0)
                } else {
                    Frame(f.frameStartNanos, f.frameDurationUiNanos, f.isJank)
                }
                synchronized(pending) {
                    pending.add(frame)
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

    @Suppress("OVERRIDE_DEPRECATION", "DEPRECATION")
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

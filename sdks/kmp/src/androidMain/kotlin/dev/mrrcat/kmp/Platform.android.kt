package dev.mrrcat.kmp

import android.util.Log

/**
 * Android Platform utilities
 */
actual class Platform actual constructor() {
    actual val name: String = "Android"
    actual val store: String = "play_store"

    actual fun log(tag: String, message: String) {
        Log.d(tag, message)
    }
}

/**
 * Get current platform
 */
actual fun getPlatform(): Platform = Platform()

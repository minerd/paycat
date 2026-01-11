package dev.paycat.kmp

import platform.Foundation.NSLog

/**
 * iOS Platform utilities
 */
actual class Platform actual constructor() {
    actual val name: String = "iOS"
    actual val store: String = "app_store"

    actual fun log(tag: String, message: String) {
        NSLog("[$tag] $message")
    }
}

/**
 * Get current platform
 */
actual fun getPlatform(): Platform = Platform()

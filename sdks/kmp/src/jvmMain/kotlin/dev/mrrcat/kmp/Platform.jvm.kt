package dev.mrrcat.kmp

/**
 * JVM Platform utilities
 */
actual class Platform actual constructor() {
    actual val name: String = "JVM"
    actual val store: String = "stripe"

    actual fun log(tag: String, message: String) {
        println("[$tag] $message")
    }
}

/**
 * Get current platform
 */
actual fun getPlatform(): Platform = Platform()

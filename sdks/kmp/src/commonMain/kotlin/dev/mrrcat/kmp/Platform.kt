package dev.mrrcat.kmp

/**
 * Platform abstraction for multiplatform code
 */
expect class Platform() {
    val name: String
    val store: String

    fun log(tag: String, message: String)
}

/**
 * Get current platform
 */
expect fun getPlatform(): Platform

plugins {
    kotlin("multiplatform") version "1.9.22"
    kotlin("plugin.serialization") version "1.9.22"
    id("com.android.library") version "8.2.0"
    id("maven-publish")
}

group = "dev.mrrcat"
version = "1.0.0"

kotlin {
    // Android target
    androidTarget {
        compilations.all {
            kotlinOptions {
                jvmTarget = "1.8"
            }
        }
        publishLibraryVariants("release")
    }

    // iOS targets
    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64()
    ).forEach {
        it.binaries.framework {
            baseName = "MRRCatKMP"
            isStatic = true
        }
    }

    // JVM target (for server-side or desktop)
    jvm("jvm") {
        compilations.all {
            kotlinOptions.jvmTarget = "1.8"
        }
    }

    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")
                implementation("io.ktor:ktor-client-core:2.3.7")
                implementation("io.ktor:ktor-client-content-negotiation:2.3.7")
                implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.7")
                implementation("io.ktor:ktor-client-logging:2.3.7")
            }
        }
        val commonTest by getting {
            dependencies {
                implementation(kotlin("test"))
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
            }
        }

        val androidMain by getting {
            dependencies {
                implementation("io.ktor:ktor-client-okhttp:2.3.7")
                implementation("com.android.billingclient:billing-ktx:6.1.0")
                implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.2")
            }
        }

        val iosX64Main by getting
        val iosArm64Main by getting
        val iosSimulatorArm64Main by getting
        val iosMain by creating {
            dependsOn(commonMain)
            iosX64Main.dependsOn(this)
            iosArm64Main.dependsOn(this)
            iosSimulatorArm64Main.dependsOn(this)
            dependencies {
                implementation("io.ktor:ktor-client-darwin:2.3.7")
            }
        }

        val jvmMain by getting {
            dependencies {
                implementation("io.ktor:ktor-client-cio:2.3.7")
            }
        }
    }
}

android {
    namespace = "dev.mrrcat.kmp"
    compileSdk = 34

    defaultConfig {
        minSdk = 24
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

publishing {
    publications {
        create<MavenPublication>("maven") {
            groupId = "dev.mrrcat"
            artifactId = "mrrcat-kmp"
            version = project.version.toString()

            pom {
                name.set("MRRCat KMP SDK")
                description.set("Kotlin Multiplatform SDK for MRRCat - Unified Payment & Subscription Management")
                url.set("https://github.com/anthropic/mrrcat-kmp")
                licenses {
                    license {
                        name.set("MIT License")
                        url.set("https://opensource.org/licenses/MIT")
                    }
                }
            }
        }
    }
}

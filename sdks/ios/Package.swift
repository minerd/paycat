// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "MRRCat",
    platforms: [
        .iOS(.v14),
        .macOS(.v11),
        .tvOS(.v14),
        .watchOS(.v7)
    ],
    products: [
        .library(
            name: "MRRCat",
            targets: ["MRRCat"]
        ),
    ],
    targets: [
        .target(
            name: "MRRCat",
            dependencies: [],
            path: "Sources/MRRCat"
        ),
        .testTarget(
            name: "MRRCatTests",
            dependencies: ["MRRCat"]
        ),
    ]
)

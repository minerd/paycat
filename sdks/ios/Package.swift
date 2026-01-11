// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "PayCat",
    platforms: [
        .iOS(.v14),
        .macOS(.v11),
        .tvOS(.v14),
        .watchOS(.v7)
    ],
    products: [
        .library(
            name: "PayCat",
            targets: ["PayCat"]
        ),
    ],
    targets: [
        .target(
            name: "PayCat",
            dependencies: [],
            path: "Sources/PayCat"
        ),
        .testTarget(
            name: "PayCatTests",
            dependencies: ["PayCat"]
        ),
    ]
)

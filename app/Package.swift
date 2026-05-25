// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "KageMenuBar",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .executable(name: "kage-menubar", targets: ["KageMenuBar"])
  ],
  targets: [
    .executableTarget(
      name: "KageMenuBar",
      path: "Sources/KageMenuBar"
    )
  ]
)

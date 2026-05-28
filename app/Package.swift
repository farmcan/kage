// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "KageMenuBar",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .library(name: "KageContracts", targets: ["KageContracts"]),
    .executable(name: "kage-menubar", targets: ["KageMenuBar"]),
    .executable(name: "kage-contract-smoke", targets: ["KageContractSmoke"])
  ],
  dependencies: [
    .package(url: "https://github.com/migueldeicaza/SwiftTerm.git", from: "1.13.0")
  ],
  targets: [
    .target(
      name: "KageContracts",
      path: "Sources/KageContracts"
    ),
    .executableTarget(
      name: "KageMenuBar",
      dependencies: [
        "KageContracts",
        .product(name: "SwiftTerm", package: "SwiftTerm")
      ],
      path: "Sources/KageMenuBar"
    ),
    .executableTarget(
      name: "KageContractSmoke",
      dependencies: ["KageContracts"],
      path: "Tests/KageContractSmoke"
    )
  ]
)

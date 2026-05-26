import SwiftUI

struct DirectoryPathSummary: View {
  let path: String
  var nameFont: Font = .body
  var pathFont: Font = .caption

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(displayName)
        .font(nameFont)
        .fontWeight(.medium)
        .lineLimit(1)
        .truncationMode(.middle)

      Text(path)
        .font(pathFont.monospaced())
        .foregroundStyle(.secondary)
        .lineLimit(2)
        .truncationMode(.middle)
        .textSelection(.enabled)
        .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var displayName: String {
    let name = URL(fileURLWithPath: path, isDirectory: true).lastPathComponent
    return name.isEmpty ? path : name
  }
}

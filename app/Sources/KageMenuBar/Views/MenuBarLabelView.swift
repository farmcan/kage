import AppKit
import SwiftUI

struct MenuBarLabelView: View {
  @EnvironmentObject private var poller: SessionPoller

  var body: some View {
    if poller.totalSessions > 0 {
      Label {
        Text("\(poller.totalSessions)")
      } icon: {
        statusIcon
      }
    } else {
      statusIcon
    }
  }

  @ViewBuilder
  private var statusIcon: some View {
    if let symbolName {
      Image(systemName: symbolName)
    } else {
      KageMenuBarIconView()
    }
  }

  private var symbolName: String? {
    if poller.errorMessage != nil {
      return "exclamationmark.triangle"
    }
    if poller.isRefreshing || poller.processActivity.isActive {
      return "arrow.triangle.2.circlepath"
    }
    if poller.doctorResult?.ok == false {
      return "bolt.slash"
    }
    return nil
  }
}

private struct KageMenuBarIconView: View {
  var body: some View {
    if let image = Self.templateImage {
      Image(nsImage: image)
        .renderingMode(.template)
    } else {
      Image(systemName: "square.stack.3d.up")
    }
  }

  private static let templateImage: NSImage? = {
    guard
      let url = Bundle.main.url(forResource: "MenuBarIconTemplate", withExtension: "png"),
      let image = NSImage(contentsOf: url)
    else {
      return nil
    }

    image.isTemplate = true
    image.size = NSSize(width: 18, height: 18)
    return image
  }()
}

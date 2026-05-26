import SwiftUI

struct MenuBarLabelView: View {
  @EnvironmentObject private var poller: SessionPoller

  var body: some View {
    if poller.totalSessions > 0 {
      Label {
        Text("\(poller.totalSessions)")
      } icon: {
        Image(systemName: symbolName)
      }
    } else {
      Image(systemName: symbolName)
    }
  }

  private var symbolName: String {
    if poller.errorMessage != nil {
      return "exclamationmark.triangle"
    }
    if poller.doctorResult?.ok == false {
      return "bolt.slash"
    }
    return "square.stack.3d.up"
  }
}

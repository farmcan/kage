import KageContracts
import SwiftUI

struct AgentTabBar: View {
  @EnvironmentObject private var appState: AppState
  let agents: [AgentGroup]

  var body: some View {
    Picker("Agent", selection: $appState.selectedAgent) {
      Text("All").tag("all")
      ForEach(agents) { agent in
        Text("\(agent.agentLabel) \(agent.sessions.count)").tag(agent.agent)
      }
    }
    .pickerStyle(.segmented)
  }
}

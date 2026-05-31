import KageContracts
import SwiftUI

struct AgentTabBar: View {
  @EnvironmentObject private var appState: AppState
  let agents: [AgentGroup]
  private let selectionOverride: Binding<String>?

  init(agents: [AgentGroup], selection: Binding<String>? = nil) {
    self.agents = agents
    self.selectionOverride = selection
  }

  var body: some View {
    Picker("Agent", selection: selection) {
      Text("All").tag("all")
      ForEach(agents) { agent in
        Text("\(agent.agentLabel) \(agent.sessions.count)").tag(agent.agent)
      }
    }
    .pickerStyle(.segmented)
    .labelsHidden()
  }

  private var selection: Binding<String> {
    selectionOverride ?? $appState.selectedAgent
  }
}

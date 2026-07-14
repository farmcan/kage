import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import PrimerBrand from "@primer/react-brand";
import {
  ArrowRightIcon,
  ArrowSwitchIcon,
  CheckIcon,
  CopyIcon,
  GitBranchIcon,
  MarkGithubIcon,
  SearchIcon,
  ShieldCheckIcon,
  TerminalIcon,
} from "@primer/octicons-react";
import "@primer/react-brand/lib/css/main.css";
import "@primer/react-brand/fonts/fonts.css";
import "./styles.css";

const {
  Button,
  CTABanner,
  Grid,
  Heading,
  Hero,
  Pillar,
  River,
  Section,
  SectionIntro,
  Stack,
  Text,
  ThemeProvider,
} = PrimerBrand;

const INSTALL_COMMAND = "curl -fsSL https://raw.githubusercontent.com/farmcan/kage/main/install.sh | bash";
const RELEASE_URL = "https://github.com/farmcan/kage/releases/download/v0.1.17/KAGE-0.1.17.dmg";

const copy = {
  "zh-CN": {
    nav: {
      why: "为什么用 KAGE",
      x2x: "Codex 分身",
      c2x: "跨 Agent",
      more: "更多能力",
      github: "GitHub",
    },
    hero: {
      eyebrow: "Claude Code · Codex · Qoder 的本地会话层",
      heading: "别让 Agent\n从零开始。",
      description: "KAGE 在本地搜索、分叉和转换 AI 编程会话，让上下文跟着任务走。",
      proof: ["找回旧工作", "双开 Codex 并行做", "Claude → Codex 接着做", "全程本地"],
      install: "安装 KAGE",
      source: "查看源码",
    },
    start: {
      label: "01 · 先安装",
      copied: "已复制",
      copy: "复制",
      then: "02 · 然后选一条任务线",
      recommended: "推荐",
      x2xTitle: "Codex 分身",
      x2xText: "复制当前上下文，开第二个 Codex 并行做。",
      c2xTitle: "Claude → Codex",
      c2xText: "把 Claude 的进度变成 Codex 原生会话。",
      local: "只读写本机 Agent 会话文件，不上传 transcript。",
    },
    benefits: {
      label: "为什么用 KAGE",
      heading: "少重复交代，多一条工作线。",
      description: "KAGE 不替代你的 Agent。它让已经发生过的工作，能被找到、复制和继续。",
      items: [
        {
          title: "找得到",
          text: "一次搜索 Claude Code、Codex、Qoder 的本地历史，不再翻 JSONL。",
        },
        {
          title: "并行做",
          text: "复制当前 Codex 会话，第二个终端带着同一份上下文立即开工。",
        },
        {
          title: "换着做",
          text: "把一个 Agent 的工作转换成另一个 Agent 可原生恢复的会话。",
        },
        {
          title: "留在本地",
          text: "没有托管索引、远程同步或 transcript 上传，数据仍在你的机器上。",
        },
      ],
    },
    x2x: {
      kicker: "kage x2x · Codex → Codex",
      heading: "一个 Codex 在跑，另一个已经开工。",
      text: "复制当前会话上下文，生成新的原生 Codex 会话。打开第二个终端，让两个 Codex 沿不同任务线并行工作。",
      link: "查看 x2x 用法",
      same: "同一份上下文",
      lines: "两条并行任务线",
      original: "终端 A · 当前 Codex",
      clone: "终端 B · Codex 分身",
      running: "运行测试中…",
      working: "实现登录错误态",
      context: "已继承 42 条消息 · 同一项目",
      success: "✓ 分支任务已开始",
    },
    c2x: {
      kicker: "kage c2x · Claude → Codex",
      heading: "换 Agent，不用重讲一遍背景。",
      text: "KAGE 读取本地 Claude Code 会话，保留项目、消息和来源关系，写成 Codex 可以原生 resume 的会话。你决定何时启动 Codex。",
      link: "查看 c2x 用法",
      source: "Claude Code",
      sourceState: "设计与排查已完成",
      bridge: "本地转换",
      target: "Codex",
      targetState: "从原进度继续实现",
      resume: "codex resume 019f…b67",
    },
    more: {
      label: "不只会转换",
      heading: "所有本地会话，一个入口。",
      description: "从找回一段旧工作，到在手机上看 Agent 运行状态，仍然是一套 CLI。",
      commands: [
        { command: 'kage search "auth"', title: "搜索全部 Agent", text: "按内容、项目和时间找到那段工作。" },
        { command: "kage sessions --since 7d", title: "浏览最近会话", text: "跨 Agent 查看最近的本地任务。" },
        { command: "kage serve --password 1234", title: "手机查看 Agent 状态", text: "在可信局域网观察本机 Agent 的进度。" },
      ],
      monitorTitle: "Monitor agents from your phone",
      monitorText: "Watch local agents over a trusted LAN — session content stays on your machine.",
    },
    cta: {
      heading: "先装上。下一次不用从零开始。",
      text: "第一条命令安装 KAGE，然后运行 kage x2x 或 kage c2x。",
      install: "复制安装命令",
      download: "下载 macOS App",
      latest: "Latest: v0.1.17",
    },
    footer: "KAGE 是开源、本地优先的 Agent 会话工具。",
  },
  en: {
    nav: {
      why: "Why KAGE",
      x2x: "Codex clone",
      c2x: "Cross-agent",
      more: "More",
      github: "GitHub",
    },
    hero: {
      eyebrow: "The local session layer for Claude Code · Codex · Qoder",
      heading: "Never make an agent\nstart from zero.",
      description: "KAGE searches, forks, and bridges AI coding sessions locally, so context follows the work.",
      proof: ["Recover past work", "Run two Codex sessions in parallel", "Continue Claude work in Codex", "Local only"],
      install: "Install KAGE",
      source: "View source",
    },
    start: {
      label: "01 · Install first",
      copied: "Copied",
      copy: "Copy",
      then: "02 · Then choose a line of work",
      recommended: "Recommended",
      x2xTitle: "Codex clone",
      x2xText: "Copy the current context and start a second Codex in parallel.",
      c2xTitle: "Claude → Codex",
      c2xText: "Turn Claude progress into a native Codex session.",
      local: "Reads and writes local agent session files. No transcript upload.",
    },
    benefits: {
      label: "Why KAGE",
      heading: "Repeat less. Open another line of work.",
      description: "KAGE does not replace your agents. It makes completed work findable, forkable, and reusable.",
      items: [
        {
          title: "Find it",
          text: "Search local Claude Code, Codex, and Qoder history at once. No more digging through JSONL.",
        },
        {
          title: "Parallelize it",
          text: "Fork the current Codex session and start a second terminal with the same context.",
        },
        {
          title: "Move it",
          text: "Bridge one agent's work into a session another agent can resume natively.",
        },
        {
          title: "Keep it local",
          text: "No hosted index, remote sync, or transcript upload. The data remains on your machine.",
        },
      ],
    },
    x2x: {
      kicker: "kage x2x · Codex → Codex",
      heading: "One Codex is still running. The next one is already working.",
      text: "Copy the current session context into a new native Codex session. Open a second terminal and let both Codex sessions work on different task lines.",
      link: "See x2x usage",
      same: "The same context",
      lines: "Two parallel task lines",
      original: "Terminal A · Current Codex",
      clone: "Terminal B · Codex clone",
      running: "Running tests…",
      working: "Implement login error states",
      context: "Inherited 42 messages · same project",
      success: "✓ Branch task started",
    },
    c2x: {
      kicker: "kage c2x · Claude → Codex",
      heading: "Switch agents without repeating the backstory.",
      text: "KAGE reads a local Claude Code session, preserves the project, messages, and lineage, then writes a session Codex can resume natively. You decide when to launch it.",
      link: "See c2x usage",
      source: "Claude Code",
      sourceState: "Design and diagnosis complete",
      bridge: "Local bridge",
      target: "Codex",
      targetState: "Continue implementation",
      resume: "codex resume 019f…b67",
    },
    more: {
      label: "More than bridges",
      heading: "Every local session. One entry point.",
      description: "Recover old work, browse recent sessions, or monitor local agents from your phone — all through one CLI.",
      commands: [
        { command: 'kage search "auth"', title: "Search every agent", text: "Find work by content, project, or time." },
        { command: "kage sessions --since 7d", title: "Browse recent sessions", text: "See recent local tasks across agents." },
        { command: "kage serve --password 1234", title: "Monitor from your phone", text: "Watch local agents over a trusted LAN." },
      ],
      monitorTitle: "Monitor agents from your phone",
      monitorText: "Watch local agents over a trusted LAN — session content stays on your machine.",
    },
    cta: {
      heading: "Install it now. Never start from zero again.",
      text: "Install KAGE with the first command, then run kage x2x or kage c2x.",
      install: "Copy install command",
      download: "Download macOS app",
      latest: "Latest: v0.1.17",
    },
    footer: "KAGE is an open-source, local-first agent session tool.",
  },
};

function CopyButton({ value, children, className = "" }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <button type="button" className={`copy-button ${className}`} onClick={handleCopy} aria-live="polite">
      {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      {copied ? copy[document.documentElement.lang]?.start.copied || "Copied" : children}
    </button>
  );
}

function TerminalWindow({ title, tone = "codex", children }) {
  return (
    <div className={`terminal-window terminal-${tone}`}>
      <div className="terminal-titlebar">
        <span className="traffic-lights" aria-hidden="true"><i /><i /><i /></span>
        <span>{title}</span>
      </div>
      <div className="terminal-body">{children}</div>
    </div>
  );
}

function LaunchPanel({ t }) {
  return (
    <div className="launch-panel" id="install">
      <div className="launch-step">
        <span>{t.start.label}</span>
        <span className="step-line" />
      </div>
      <div className="command-bar command-bar-install">
        <code>{INSTALL_COMMAND}</code>
        <CopyButton value={INSTALL_COMMAND}>{t.start.copy}</CopyButton>
      </div>
      <div className="launch-step launch-step-second">
        <span>{t.start.then}</span>
        <span className="recommended-label">{t.start.recommended}</span>
      </div>
      <div className="route-list">
        <a href="#x2x" className="route-card route-x2x">
          <span className="route-icon"><GitBranchIcon size={18} /></span>
          <span className="route-copy">
            <code>kage x2x</code>
            <strong>{t.start.x2xTitle}</strong>
            <small>{t.start.x2xText}</small>
          </span>
          <ArrowRightIcon className="route-arrow" size={18} />
        </a>
        <a href="#c2x" className="route-card route-c2x">
          <span className="route-icon"><ArrowSwitchIcon size={18} /></span>
          <span className="route-copy">
            <code>kage c2x</code>
            <strong>{t.start.c2xTitle}</strong>
            <small>{t.start.c2xText}</small>
          </span>
          <ArrowRightIcon className="route-arrow" size={18} />
        </a>
      </div>
      <div className="local-note"><ShieldCheckIcon size={16} /><span>{t.start.local}</span></div>
    </div>
  );
}

function ParallelVisual({ t }) {
  return (
    <div className="parallel-visual" aria-label={`${t.x2x.same}, ${t.x2x.lines}`}>
      <div className="parallel-caption">
        <span>{t.x2x.same}</span>
        <i />
        <strong>{t.x2x.lines}</strong>
      </div>
      <div className="terminal-pair">
        <TerminalWindow title={t.x2x.original}>
          <p><span className="prompt">›</span> {t.x2x.running}</p>
          <p className="terminal-muted">$ npm test</p>
          <p className="terminal-stream">test 131/168 <span className="cursor" /></p>
        </TerminalWindow>
        <TerminalWindow title={t.x2x.clone}>
          <p><span className="prompt">›</span> {t.x2x.working}</p>
          <p className="terminal-muted">{t.x2x.context}</p>
          <p className="terminal-success">{t.x2x.success}</p>
        </TerminalWindow>
      </div>
      <div className="fork-command"><TerminalIcon size={15} /><code>kage x2x</code></div>
    </div>
  );
}

function BridgeVisual({ t }) {
  return (
    <div className="bridge-visual">
      <div className="agent-node agent-claude">
        <span className="agent-mark">C</span>
        <div><strong>{t.c2x.source}</strong><small>{t.c2x.sourceState}</small></div>
      </div>
      <div className="bridge-track">
        <span className="bridge-command">kage c2x</span>
        <span className="bridge-line"><i /></span>
        <small><ShieldCheckIcon size={13} />{t.c2x.bridge}</small>
      </div>
      <div className="agent-node agent-codex">
        <span className="agent-mark">X</span>
        <div><strong>{t.c2x.target}</strong><small>{t.c2x.targetState}</small></div>
      </div>
      <div className="resume-hint"><span>$</span><code>{t.c2x.resume}</code></div>
    </div>
  );
}

const benefitIcons = [SearchIcon, GitBranchIcon, ArrowSwitchIcon, ShieldCheckIcon];
const benefitColors = ["blue", "green", "coral", "purple"];

function App() {
  const [locale, setLocale] = useState(() => localStorage.getItem("kage-locale") === "en" ? "en" : "zh-CN");
  const t = copy[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem("kage-locale", locale);
  }, [locale]);

  return (
    <ThemeProvider colorMode="dark" className="kage-theme">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="KAGE home">
          <img src="/kage/assets/kage-logo.svg" alt="" />
          <span>KAGE</span>
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#why">{t.nav.why}</a>
          <a href="#x2x">{t.nav.x2x}</a>
          <a href="#c2x">{t.nav.c2x}</a>
          <a href="#more">{t.nav.more}</a>
        </nav>
        <div className="nav-actions">
          <div className="locale-switch" aria-label="Language">
            <button type="button" className={locale === "zh-CN" ? "active" : ""} onClick={() => setLocale("zh-CN")}>中文</button>
            <button type="button" className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button>
          </div>
          <Button as="a" href="https://github.com/farmcan/kage" size="small" variant="subtle" leadingVisual={<MarkGithubIcon />}>
            <span className="github-label">{t.nav.github}</span>
          </Button>
        </div>
      </header>

      <main id="top">
        <Section className="hero-section" paddingBlockStart="normal" paddingBlockEnd="spacious" fullWidth>
          <Grid className="hero-grid">
            <Grid.Column span={{ xsmall: 12, medium: 6, large: 6 }}>
              <Hero align="start" className="kage-hero">
                <Hero.Eyebrow>{t.hero.eyebrow}</Hero.Eyebrow>
                <Hero.Heading>{t.hero.heading.split("\n").map((line, index) => <React.Fragment key={line}>{index > 0 && <br />}{line}</React.Fragment>)}</Hero.Heading>
                <Hero.Description>{t.hero.description}</Hero.Description>
                <Hero.PrimaryAction href="#install">{t.hero.install}</Hero.PrimaryAction>
                <Hero.SecondaryAction href="https://github.com/farmcan/kage">{t.hero.source}</Hero.SecondaryAction>
              </Hero>
              <div className="proof-line">
                {t.hero.proof.map((item) => <span key={item}><CheckIcon size={14} />{item}</span>)}
              </div>
            </Grid.Column>
            <Grid.Column span={{ xsmall: 12, medium: 6, large: 6 }}>
              <LaunchPanel t={t} />
            </Grid.Column>
          </Grid>
        </Section>

        <Section id="why" className="benefit-section" paddingBlockStart="spacious" paddingBlockEnd="spacious">
          <SectionIntro align="center">
            <SectionIntro.Label color="green">{t.benefits.label}</SectionIntro.Label>
            <SectionIntro.Heading size="2">{t.benefits.heading}</SectionIntro.Heading>
            <SectionIntro.Description>{t.benefits.description}</SectionIntro.Description>
          </SectionIntro>
          <Grid className="benefit-grid">
            {t.benefits.items.map((item, index) => {
              const Icon = benefitIcons[index];
              return (
                <Grid.Column key={item.title} span={{ xsmall: 12, small: 6, large: 3 }}>
                  <Pillar className="benefit-pillar" hasBorder>
                    <Pillar.Icon icon={<Icon size={24} />} color={benefitColors[index]} />
                    <Pillar.Heading as="h3" size="4">{item.title}</Pillar.Heading>
                    <Pillar.Description>{item.text}</Pillar.Description>
                  </Pillar>
                </Grid.Column>
              );
            })}
          </Grid>
        </Section>

        <Section id="x2x" className="workflow-section workflow-x2x" paddingBlockStart="spacious" paddingBlockEnd="spacious">
          <River imageTextRatio="60:40">
            <River.Visual fillMedia={false} hasShadow={false} rounded={false}>
              <ParallelVisual t={t} />
            </River.Visual>
            <River.Content>
              <Heading as="h2" size="2">{t.x2x.heading}</Heading>
              <Text as="p" size="400" variant="muted">{t.x2x.text}</Text>
              <Button as="a" href="https://github.com/farmcan/kage#core-examples" variant="subtle" hasArrow>
                {t.x2x.link}
              </Button>
              <span className="workflow-kicker">{t.x2x.kicker}</span>
            </River.Content>
          </River>
        </Section>

        <Section id="c2x" className="workflow-section workflow-c2x" paddingBlockStart="spacious" paddingBlockEnd="spacious" backgroundColor="subtle">
          <River align="end" imageTextRatio="60:40">
            <River.Visual fillMedia={false} hasShadow={false} rounded={false}>
              <BridgeVisual t={t} />
            </River.Visual>
            <River.Content>
              <Heading as="h2" size="2">{t.c2x.heading}</Heading>
              <Text as="p" size="400" variant="muted">{t.c2x.text}</Text>
              <Button as="a" href="https://github.com/farmcan/kage#core-examples" variant="subtle" hasArrow>
                {t.c2x.link}
              </Button>
              <span className="workflow-kicker">{t.c2x.kicker}</span>
            </River.Content>
          </River>
        </Section>

        <Section id="more" className="more-section" paddingBlockStart="spacious" paddingBlockEnd="spacious">
          <Grid>
            <Grid.Column span={{ xsmall: 12, medium: 5 }}>
              <SectionIntro>
                <SectionIntro.Label color="blue">{t.more.label}</SectionIntro.Label>
                <SectionIntro.Heading size="2">{t.more.heading}</SectionIntro.Heading>
                <SectionIntro.Description>{t.more.description}</SectionIntro.Description>
              </SectionIntro>
              <div className="monitor-note">
                <TerminalIcon size={18} />
                <div><strong>{t.more.monitorTitle}</strong><span>{t.more.monitorText}</span></div>
              </div>
            </Grid.Column>
            <Grid.Column span={{ xsmall: 12, medium: 7 }}>
              <div className="command-list">
                {t.more.commands.map((item, index) => (
                  <div className="command-row" key={item.command}>
                    <span className="command-index">0{index + 1}</span>
                    <div><code>{item.command}</code><strong>{item.title}</strong><small>{item.text}</small></div>
                    <CopyButton value={item.command}>{t.start.copy}</CopyButton>
                  </div>
                ))}
              </div>
            </Grid.Column>
          </Grid>
        </Section>

        <Section className="cta-section" paddingBlockStart="normal" paddingBlockEnd="normal">
          <CTABanner align="start" hasBorder hasShadow={false} className="kage-cta">
            <CTABanner.Heading size="2">{t.cta.heading}</CTABanner.Heading>
            <CTABanner.Description>{t.cta.text}</CTABanner.Description>
            <CTABanner.ButtonGroup>
              <Button variant="primary" onClick={() => navigator.clipboard.writeText(INSTALL_COMMAND)} leadingVisual={<CopyIcon />}>
                {t.cta.install}
              </Button>
              <Button as="a" href={RELEASE_URL} variant="secondary">{t.cta.download}</Button>
            </CTABanner.ButtonGroup>
            <span className="release-label">{t.cta.latest}</span>
          </CTABanner>
        </Section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><img src="/kage/assets/kage-logo.svg" alt="" /><strong>KAGE</strong></div>
        <p>{t.footer}</p>
        <Stack direction="horizontal" gap="normal" className="footer-links">
          <a href="https://github.com/farmcan/kage">GitHub</a>
          <a href={RELEASE_URL}>macOS</a>
          <a href="https://github.com/farmcan/kage/blob/main/LICENSE">MIT</a>
        </Stack>
      </footer>
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

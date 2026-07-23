import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import PrimerBrand from "@primer/react-brand";
import {
  ArrowRightIcon,
  ArrowSwitchIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  GitBranchIcon,
  HeartIcon,
  MarkGithubIcon,
  MoonIcon,
  SearchIcon,
  ShieldCheckIcon,
  SunIcon,
  TerminalIcon,
  XIcon,
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
const SUPPORT_QR_IMAGE = "/kage/assets/support-alipay-qr.jpg";

const copy = {
  "zh-CN": {
    nav: {
      why: "为什么用 KAGE",
      x2x: "Agent 分身",
      c2x: "跨 Agent 接力",
      more: "更多能力",
      support: "支持 KAGE",
      github: "GitHub",
      darkTheme: "黑色",
      lightTheme: "白色",
      switchToDark: "切换到黑色主题",
      switchToLight: "切换到白色主题",
    },
    hero: {
      eyebrow: "Claude Code · Codex · QoderCLI 的本地会话层",
      heading: "别让 Agent\n从零开始。",
      description: "KAGE 在本地搜索、分叉和转换 AI 编程会话，让上下文跟着任务走。",
      proof: ["找回旧工作", "支持的 Agent 都能分身", "跨 Agent 带上下文接力", "全程本地"],
      install: "安装 KAGE",
      source: "查看源码",
    },
    start: {
      label: "01 · 先安装",
      copied: "已复制",
      installCopied: "安装命令已复制",
      copy: "复制",
      then: "02 · 然后选一条任务线",
      recommended: "推荐",
      x2xTitle: "Agent 分身",
      x2xText: "Codex、Claude Code、QoderCLI 都能复制会话；x2x 是最快的 Codex 双开。",
      c2xTitle: "跨 Agent 接力",
      c2xText: "Claude Code、Codex、QoderCLI 之间转换，带着上下文继续做。",
      local: "只读写本机 Agent 会话文件，不上传 transcript。",
    },
    benefits: {
      label: "为什么用 KAGE",
      heading: "少重复交代，多一条工作线。",
      description: "KAGE 不替代你的 Agent。它让已经发生过的工作，能被找到、复制和继续。",
      items: [
        {
          title: "找得到",
          text: "一次搜索 Claude Code、Codex、QoderCLI 的本地历史，不再翻 JSONL。",
        },
        {
          title: "并行做",
          text: "复制 Codex、Claude Code 或 QoderCLI 会话，第二条任务线带着同一份上下文开工。",
        },
        {
          title: "换着做",
          text: "在 Claude Code、Codex 与 QoderCLI 之间转换，目标 Agent 可原生恢复。",
        },
        {
          title: "留在本地",
          text: "没有托管索引、远程同步或 transcript 上传，数据仍在你的机器上。",
        },
      ],
    },
    x2x: {
      kicker: "同 Agent 分身 · x2x / c2c / q2q",
      heading: "不只 Codex。每个 Agent 都能再开一条工作线。",
      text: "用 x2x、c2c 或 q2q 复制 Codex、Claude Code、QoderCLI 的当前会话，生成各自原生可继续的分身。",
      link: "查看全部分身命令",
      same: "同一个 Agent 的上下文",
      lines: "复制成另一条任务线",
      original: "示例 · 当前 Codex",
      clone: "示例 · Codex 分身",
      running: "运行测试中…",
      working: "实现登录错误态",
      context: "已继承 42 条消息 · 同一项目",
      success: "✓ 分支任务已开始",
      forks: [
        { command: "kage x2x", agent: "Codex" },
        { command: "kage c2c", agent: "Claude Code" },
        { command: "kage q2q", agent: "QoderCLI" },
      ],
    },
    c2x: {
      kicker: "跨 Agent 接力 · c2x / q2x / x2q",
      heading: "Claude、Codex、QoderCLI，换着做也不用重讲。",
      text: "KAGE 在 Claude Code、Codex 与 QoderCLI 之间转换本地会话，保留项目、消息和来源关系，写成目标 Agent 可原生恢复的会话。",
      link: "查看全部转换命令",
      visualLabel: "本地会话转换",
      bridge: "本地转换",
      also: "也支持 x2c · c2q · q2c",
      routes: [
        { command: "kage c2x", from: "Claude Code", fromMark: "C", fromTone: "claude", to: "Codex", toMark: "X", toTone: "codex" },
        { command: "kage q2x", from: "QoderCLI", fromMark: "Q", fromTone: "qoder", to: "Codex", toMark: "X", toTone: "codex" },
        { command: "kage x2q", from: "Codex", fromMark: "X", fromTone: "codex", to: "QoderCLI", toMark: "Q", toTone: "qoder" },
      ],
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
    support: {
      title: "支持 KAGE",
      badge: "完全自愿 · 不影响任何功能",
      heading: "请作者喝杯咖啡",
      description: "KAGE 会继续免费开源。愿意的话，可以支持 Agent 兼容性维护、发布构建和后续开发。",
      scan: "电脑端直接扫码；手机端保存后在支付宝识别。",
      save: "保存支付宝收款码",
      trust: "支持不会解锁额外功能，也不会改变 KAGE 的本地优先承诺。",
      close: "关闭支持窗口",
    },
    footer: "KAGE 是开源、本地优先的 Agent 会话工具。",
  },
  en: {
    nav: {
      why: "Why KAGE",
      x2x: "Agent clones",
      c2x: "Cross-agent handoff",
      more: "More",
      support: "Support KAGE",
      github: "GitHub",
      darkTheme: "Dark",
      lightTheme: "Light",
      switchToDark: "Switch to dark theme",
      switchToLight: "Switch to light theme",
    },
    hero: {
      eyebrow: "The local session layer for Claude Code · Codex · QoderCLI",
      heading: "Never make an agent\nstart from zero.",
      description: "KAGE searches, forks, and bridges AI coding sessions locally, so context follows the work.",
      proof: ["Recover past work", "Clone any supported agent", "Carry context across agents", "Local only"],
      install: "Install KAGE",
      source: "View source",
    },
    start: {
      label: "01 · Install first",
      copied: "Copied",
      installCopied: "Install command copied",
      copy: "Copy",
      then: "02 · Then choose a line of work",
      recommended: "Recommended",
      x2xTitle: "Agent clone",
      x2xText: "Fork Codex, Claude Code, or QoderCLI sessions; x2x is the fastest Codex example.",
      c2xTitle: "Cross-agent handoff",
      c2xText: "Move context between Claude Code, Codex, and QoderCLI, then keep working.",
      local: "Reads and writes local agent session files. No transcript upload.",
    },
    benefits: {
      label: "Why KAGE",
      heading: "Repeat less. Open another line of work.",
      description: "KAGE does not replace your agents. It makes completed work findable, forkable, and reusable.",
      items: [
        {
          title: "Find it",
          text: "Search local Claude Code, Codex, and QoderCLI history at once. No more digging through JSONL.",
        },
        {
          title: "Parallelize it",
          text: "Fork a Codex, Claude Code, or QoderCLI session and start another task line with the same context.",
        },
        {
          title: "Move it",
          text: "Bridge work between Claude Code, Codex, and QoderCLI into a session the target can resume natively.",
        },
        {
          title: "Keep it local",
          text: "No hosted index, remote sync, or transcript upload. The data remains on your machine.",
        },
      ],
    },
    x2x: {
      kicker: "Same-agent clones · x2x / c2c / q2q",
      heading: "Not just Codex. Give every agent another line of work.",
      text: "Use x2x, c2c, or q2q to fork the current Codex, Claude Code, or QoderCLI session into a native clone that can continue immediately.",
      link: "See every clone command",
      same: "One agent's context",
      lines: "Forked into another task line",
      original: "Example · Current Codex",
      clone: "Example · Codex clone",
      running: "Running tests…",
      working: "Implement login error states",
      context: "Inherited 42 messages · same project",
      success: "✓ Branch task started",
      forks: [
        { command: "kage x2x", agent: "Codex" },
        { command: "kage c2c", agent: "Claude Code" },
        { command: "kage q2q", agent: "QoderCLI" },
      ],
    },
    c2x: {
      kicker: "Cross-agent handoff · c2x / q2x / x2q",
      heading: "Switch between Claude, Codex, and QoderCLI without repeating the backstory.",
      text: "KAGE bridges local sessions between Claude Code, Codex, and QoderCLI, preserving the project, messages, and lineage in a session the target agent can resume natively.",
      link: "See every bridge command",
      visualLabel: "Local session bridges",
      bridge: "Local bridge",
      also: "Also supports x2c · c2q · q2c",
      routes: [
        { command: "kage c2x", from: "Claude Code", fromMark: "C", fromTone: "claude", to: "Codex", toMark: "X", toTone: "codex" },
        { command: "kage q2x", from: "QoderCLI", fromMark: "Q", fromTone: "qoder", to: "Codex", toMark: "X", toTone: "codex" },
        { command: "kage x2q", from: "Codex", fromMark: "X", fromTone: "codex", to: "QoderCLI", toMark: "Q", toTone: "qoder" },
      ],
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
    support: {
      title: "Support KAGE",
      badge: "Optional · No features are gated",
      heading: "Buy the maintainer a coffee",
      description: "KAGE will stay free and open source. Your support helps maintain agent compatibility, release builds, and future development.",
      scan: "Scan with Alipay on desktop; save the image on mobile and open it in Alipay.",
      save: "Save Alipay QR code",
      trust: "Support does not unlock features or change KAGE's local-first promise.",
      close: "Close support dialog",
    },
    footer: "KAGE is an open-source, local-first agent session tool.",
  },
};

async function copyTextToClipboard(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    document.body.append(textarea);
    try {
      textarea.select();
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}

function useCopyFeedback() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  async function copyValue(value) {
    const didCopy = await copyTextToClipboard(value);
    if (!didCopy) return;
    setCopied(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1800);
  }

  return [copied, copyValue];
}

function CopyButton({ value, children, className = "", copiedLabel }) {
  const [copied, copyValue] = useCopyFeedback();

  const label = copied ? copiedLabel || copy[document.documentElement.lang]?.start.copied || "Copied" : children;

  return (
    <button type="button" className={`copy-button ${className}`} onClick={() => copyValue(value)} aria-live="polite">
      {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      {label}
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
        <CopyButton value={INSTALL_COMMAND} copiedLabel={t.start.installCopied}>{t.start.copy}</CopyButton>
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
      <div className="fork-options">
        {t.x2x.forks.map((fork) => (
          <span key={fork.command}><code>{fork.command}</code><small>{fork.agent}</small></span>
        ))}
      </div>
    </div>
  );
}

function BridgeVisual({ t }) {
  return (
    <div className="bridge-visual" aria-label={t.c2x.visualLabel}>
      <div className="bridge-visual-head">
        <strong>{t.c2x.visualLabel}</strong>
        <small><ShieldCheckIcon size={13} />{t.c2x.bridge}</small>
      </div>
      <div className="bridge-route-list">
        {t.c2x.routes.map((route) => (
          <div className="bridge-route" key={route.command}>
            <span className={`route-agent route-agent-${route.fromTone}`}>
              <b>{route.fromMark}</b><strong>{route.from}</strong>
            </span>
            <span className="route-command">
              <code>{route.command}</code><ArrowRightIcon size={15} />
            </span>
            <span className={`route-agent route-agent-${route.toTone}`}>
              <b>{route.toMark}</b><strong>{route.to}</strong>
            </span>
          </div>
        ))}
      </div>
      <div className="bridge-more">{t.c2x.also}</div>
    </div>
  );
}

function SupportDialog({ onClose, t }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="support-dialog"
      aria-labelledby="support-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="support-dialog-shell">
        <div className="support-dialog-header">
          <span>{t.support.title}</span>
          <button type="button" className="support-close" onClick={onClose} aria-label={t.support.close}>
            <XIcon size={18} />
          </button>
        </div>
        <div className="support-dialog-copy">
          <span className="support-badge">{t.support.badge}</span>
          <Heading as="h2" size="3" id="support-dialog-title">{t.support.heading}</Heading>
          <Text as="p" size="300" variant="muted">{t.support.description}</Text>
        </div>
        <div className="support-payment">
          <div className="support-qr-frame">
            <img src={SUPPORT_QR_IMAGE} alt={t.support.save} />
          </div>
          <Text as="p" size="100" variant="muted" align="center">{t.support.scan}</Text>
          <Button
            as="a"
            href={SUPPORT_QR_IMAGE}
            download="kage-alipay-qr.jpg"
            variant="secondary"
            size="small"
            leadingVisual={<DownloadIcon />}
          >
            {t.support.save}
          </Button>
        </div>
        <div className="support-trust">
          <ShieldCheckIcon size={17} />
          <span>{t.support.trust}</span>
        </div>
      </div>
    </dialog>
  );
}

const benefitIcons = [SearchIcon, GitBranchIcon, ArrowSwitchIcon, ShieldCheckIcon];
const benefitColors = ["blue", "green", "coral", "purple"];

function App() {
  const [locale, setLocale] = useState(() => localStorage.getItem("kage-locale") === "en" ? "en" : "zh-CN");
  const [colorMode, setColorMode] = useState(() => localStorage.getItem("kage-theme") === "dark" ? "dark" : "light");
  const [supportOpen, setSupportOpen] = useState(false);
  const [installCopied, copyInstallCommand] = useCopyFeedback();
  const t = copy[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem("kage-locale", locale);
  }, [locale]);

  useEffect(() => {
    document.documentElement.dataset.theme = colorMode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colorMode === "dark" ? "#07090d" : "#ffffff");
    localStorage.setItem("kage-theme", colorMode);
  }, [colorMode]);

  const nextThemeLabel = colorMode === "light" ? t.nav.switchToDark : t.nav.switchToLight;

  return (
    <ThemeProvider colorMode={colorMode} className="kage-theme">
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
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setColorMode((current) => current === "light" ? "dark" : "light")}
            aria-label={nextThemeLabel}
            title={nextThemeLabel}
          >
            {colorMode === "light" ? <MoonIcon size={16} /> : <SunIcon size={16} />}
            <span className="theme-label">{colorMode === "light" ? t.nav.darkTheme : t.nav.lightTheme}</span>
          </button>
          <Button
            size="small"
            variant="secondary"
            leadingVisual={<HeartIcon />}
            onClick={() => setSupportOpen(true)}
            aria-haspopup="dialog"
            aria-label={t.nav.support}
          >
            <span className="support-label">{t.nav.support}</span>
          </Button>
          <Button as="a" href="https://github.com/farmcan/kage" size="small" variant="subtle" leadingVisual={<MarkGithubIcon />} aria-label={t.nav.github}>
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
                <Hero.PrimaryAction href="#install-kage">{t.hero.install}</Hero.PrimaryAction>
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
                    <CopyButton value={item.command} copiedLabel={t.start.copied}>{t.start.copy}</CopyButton>
                  </div>
                ))}
              </div>
            </Grid.Column>
          </Grid>
        </Section>

        <Section id="install-kage" className="cta-section" paddingBlockStart="normal" paddingBlockEnd="normal">
          <CTABanner align="start" hasBorder hasShadow={false} className="kage-cta">
            <CTABanner.Heading size="2">{t.cta.heading}</CTABanner.Heading>
            <CTABanner.Description>{t.cta.text}</CTABanner.Description>
            <CTABanner.ButtonGroup>
              <Button
                variant="primary"
                onClick={() => copyInstallCommand(INSTALL_COMMAND)}
                leadingVisual={installCopied ? <CheckIcon /> : <CopyIcon />}
                aria-live="polite"
              >
                {installCopied ? t.start.installCopied : t.cta.install}
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
          <button type="button" onClick={() => setSupportOpen(true)}>{t.nav.support}</button>
          <a href="https://github.com/farmcan/kage">GitHub</a>
          <a href={RELEASE_URL}>macOS</a>
          <a href="https://github.com/farmcan/kage/blob/main/LICENSE">MIT</a>
        </Stack>
      </footer>
      {supportOpen && <SupportDialog t={t} onClose={() => setSupportOpen(false)} />}
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

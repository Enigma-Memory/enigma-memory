/**
 * Enigma Memory in-app help panel.
 *
 * Provides context-sensitive articles for the desktop setup wizard and
 * health dashboard. Loaded as a module alongside wizard.js.
 */

const HELP_ARTICLES = {
  welcome: {
    title: 'Welcome to Enigma Memory',
    body: `
      <p>Enigma Memory creates a private Memory Drive on this computer. Connected AI apps can ask for helpful facts when you allow it.</p>
      <p>Setup has six short steps: create your local vault, find supported AI apps, connect the ones you choose, run a health check, review the dashboard, and finish when everything is ready.</p>
      <p>You do not need to install Node, open a terminal, or edit JSON files for the default setup.</p>
    `,
  },
  vault: {
    title: 'Your local vault',
    body: `
      <p>Your vault stores Enigma Memory data on this device. It stays local unless you choose to move or export something.</p>
      <p>The default location uses your operating system's application data folder. You can change it later in Settings.</p>
      <p>Creating a vault does not delete anything from AI providers or change how their apps work.</p>
    `,
  },
  connections: {
    title: 'Connecting AI apps',
    body: `
      <p>Enigma can connect to supported AI clients such as Claude Desktop and Cursor.</p>
      <p>When you approve a connection, Enigma adds only its own entry to that app's settings. The app's other connection settings are preserved.</p>
      <p>If a connection needs repair, Enigma can restore its backup or run a safe reset that reapplies the Enigma entry. Rollback and repair do not show setup files or local paths.</p>
      <p>Some apps need a restart before they can use Enigma Memory. The app will tell you when.</p>
    `,
  },
  health: {
    title: 'Health dashboard',
    body: `
      <p>The health dashboard shows whether your local vault, connected apps, and privacy checks are ready.</p>
      <p>If something needs attention, Enigma explains the issue and offers a fix-it action. Issue codes are safe to share with support.</p>
      <p>Connection recovery can restore an Enigma-managed backup, rollback the last Enigma-managed connection change, or reapply Enigma's entry while preserving the app's other connection settings.</p>
      <p>Repair and rollback do not alter provider memory, model behavior, or provider-side logs. Local health checks work without network access.</p>
      <p>The Import Sandbox previews text, Markdown, and provider exports before any vault write, then shows duplicate groups, batch receipts, and rollback receipts as public-safe metadata.</p>
    `,
  },
  memoryController: {
    title: 'Memory Controller',
    body: `
      <p>Memory Weather is the plain-language status for what Enigma can share right now: clear, needs review, or sharing paused.</p>
      <p>Read the section like a traffic light: clear means local checks found no issue and you still approve each app request, needs review means check permissions, and sharing paused means fix the warning before Enigma shares local context.</p>
      <p>App permissions use just-in-time consent. A connected app may ask for local memory, but Enigma shows the decision before sharing context.</p>
      <p>Recall approval has two steps: review the local decision first, then explicitly approve this one recall or keep it not shared. Review alone never shares memory.</p>
      <p>A private memory bubble is a local review space for draft memory. Opening or closing it controls the local bubble only; provider records and model behavior require provider-side evidence.</p>
    `,
  },
  privacy: {
    title: 'Privacy boundaries',
    body: `
      <p>Enigma keeps its canonical memory vault on this device. Connected AI apps receive context only when you connect and use them.</p>
      <p>Enigma does not claim control over provider logs, backups, or model behavior. Provider-side changes require provider evidence.</p>
      <p>Proof artifacts can show hashes, roots, counts, timestamps, and validation results without exposing raw memory text.</p>
    `,
  },
  updateCheck: {
    title: 'Update checks',
    body: `
      <p>Enigma checks the official release feed over HTTPS and verifies the signature on every update before offering it.</p>
      <p>No update is downloaded or installed automatically. You approve each update from Settings &gt; General &gt; Check for updates.</p>
      <p>Update checks do not send memory contents, prompts, wallet information, or local paths to the update server.</p>
      <p>For more detail, see the full <a href="https://enigmamemory.com/help/update-check.html" target="_blank" rel="noopener">update checks guide</a>.</p>
    `,
  },
  crashReporting: {
    title: 'Crash reporting opt-in',
    body: `
      <p>Crash reporting is off by default. You can turn it on in Settings &gt; Support.</p>
      <p>If enabled, reports include only the app version, OS family, a coarse timestamp, and the first panic line. They never include memory, prompts, wallet data, or local paths.</p>
      <p>Pending reports are kept locally until you choose to send them. Turning crash reporting off stops all transmission.</p>
      <p>For more detail, see the full <a href="https://enigmamemory.com/help/crash-reporting-opt-in.html" target="_blank" rel="noopener">crash reporting guide</a>.</p>
    `,
  },
};

const DEFAULT_CONTEXT = 'welcome';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function $(selector) {
  return document.querySelector(selector);
}

function renderHelpPanel() {
  if ($('#help-panel')) return;
  const panel = document.createElement('aside');
  panel.id = 'help-panel';
  panel.className = 'help-panel';
  panel.setAttribute('aria-hidden', 'true');
  panel.setAttribute('aria-label', 'In-app help');
  panel.innerHTML = `
    <div class="help-panel__overlay" data-help-action="close"></div>
    <div class="help-panel__sheet" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div class="help-panel__header">
        <h2 id="help-title">Help</h2>
        <button type="button" class="help-panel__close" data-help-action="close" aria-label="Close help">×</button>
      </div>
      <nav class="help-panel__nav" aria-label="Help topics">
        ${Object.entries(HELP_ARTICLES)
          .map(
            ([id, article]) =>
              `<button type="button" class="help-panel__topic" data-help-topic="${escapeHtml(id)}">${escapeHtml(article.title)}</button>`
          )
          .join('')}
      </nav>
      <div id="help-content" class="help-panel__content"></div>
    </div>
  `;
  document.body.appendChild(panel);
  wireHelpEvents();
}

function wireHelpEvents() {
  document.querySelectorAll('[data-help-action="close"]').forEach((el) => {
    el.addEventListener('click', closeHelp);
  });
  document.querySelectorAll('[data-help-topic]').forEach((el) => {
    el.addEventListener('click', () => showHelpArticle(el.dataset.helpTopic));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeHelp();
  });
}

export function renderHelpButton(context = DEFAULT_CONTEXT) {
  return `<button type="button" class="help-button" data-help-open="${escapeHtml(context)}" aria-label="Open help: ${escapeHtml(HELP_ARTICLES[context]?.title || 'Help')}">?</button>`;
}

function showHelpArticle(context = DEFAULT_CONTEXT) {
  const article = HELP_ARTICLES[context] || HELP_ARTICLES[DEFAULT_CONTEXT];
  const content = $('#help-content');
  if (!content) return;
  content.innerHTML = `<h3>${escapeHtml(article.title)}</h3>${article.body}`;
  document.querySelectorAll('.help-panel__topic').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.helpTopic === context);
  });
}

export function openHelp(context = DEFAULT_CONTEXT) {
  renderHelpPanel();
  const panel = $('#help-panel');
  if (!panel) return;
  showHelpArticle(context);
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  const closeBtn = panel.querySelector('.help-panel__close');
  closeBtn?.focus();
}

export function closeHelp() {
  const panel = $('#help-panel');
  if (!panel) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
}

export function initHelp() {
  renderHelpPanel();
  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-help-open]');
    if (opener) {
      event.preventDefault();
      openHelp(opener.dataset.helpOpen);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHelp);
} else {
  initHelp();
}

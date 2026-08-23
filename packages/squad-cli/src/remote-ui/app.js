/**
 * Squad Remote Control — PTY Terminal PWA
 * Raw terminal rendering via xterm.js + WebSocket
 */
(function () {
  'use strict';

  let ws = null;
  let connected = false;
  let replaying = false;
  let reconnectDelay = 1000;

  const $ = (sel) => document.querySelector(sel);
  const terminal = $('#terminal');
  const inputEl = $('#input');
  const formEl = $('#input-form');
  const statusEl = $('#status-indicator');
  const statusText = $('#status-text');
  const permOverlay = $('#permission-overlay');
  const dashboard = $('#dashboard');
  const termContainer = $('#terminal-container');
  let currentView = 'terminal'; // 'dashboard' or 'terminal'

  // ─── xterm.js Terminal ───────────────────────────────────
  let xterm = null;
  let fitAddon = null;

  function initXterm() {
    if (xterm) return;
    xterm = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#3fb950',
        selectionBackground: '#264f78',
        black: '#0d1117',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#c9d1d9',
        brightBlack: '#6e7681',
        brightRed: '#f85149',
        brightGreen: '#3fb950',
        brightYellow: '#d29922',
        brightBlue: '#58a6ff',
        brightMagenta: '#bc8cff',
        brightCyan: '#39c5cf',
        brightWhite: '#f0f6fc',
      },
      fontFamily: "'Cascadia Code', 'SF Mono', 'Fira Code', 'Menlo', monospace",
      fontSize: 13,
      scrollback: 5000,
      cursorBlink: true,
    });

    fitAddon = new FitAddon.FitAddon();
    xterm.loadAddon(fitAddon);
    xterm.open(termContainer);
    fitAddon.fit();

    // Send terminal size to PTY so copilot renders correctly
    function sendResize() {
      if (ws && ws.readyState === WebSocket.OPEN && xterm) {
        ws.send(JSON.stringify({ type: 'pty_resize', cols: xterm.cols, rows: xterm.rows }));
      }
    }

    // Handle resize
    window.addEventListener('resize', () => {
      if (fitAddon) { fitAddon.fit(); sendResize(); }
    });

    // Send initial size
    setTimeout(sendResize, 500);

    // Keyboard input → send to bridge → PTY
    xterm.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pty_input', data }));
      }
    });
  }

  // ─── Dashboard ───────────────────────────────────────────
  let showOffline = false;

  async function loadSessions() {
    try {
      const resp = await fetch('/api/sessions');
      const data = await resp.json();
      renderDashboard(data.sessions || []);
    } catch (err) {
      dashboard.innerHTML = '<div style="padding:12px;color:var(--red)">' + escapeHtml('Failed to load sessions: ' + err.message) + '</div>';
    }
  }

  function renderDashboard(sessions) {
    const filtered = showOffline ? sessions : sessions.filter(s => s.online);
    const offlineCount = sessions.filter(s => !s.online).length;
    const onlineCount = sessions.filter(s => s.online).length;

    let html = `<div style="padding:8px 4px;display:flex;align-items:center;gap:8px">
      <span style="color:var(--text-dim);font-size:12px">${onlineCount} online${offlineCount > 0 ? ', ' + offlineCount + ' offline' : ''}</span>
      <span style="flex:1"></span>
      <button onclick="toggleOffline()" style="background:none;border:1px solid var(--border);color:var(--text-dim);font-family:var(--font);font-size:11px;padding:3px 8px;border-radius:4px;cursor:pointer">${showOffline ? 'Hide offline' : 'Show offline'}</button>
      ${offlineCount > 0 ? '<button onclick="cleanOffline()" style="background:none;border:1px solid var(--red);color:var(--red);font-family:var(--font);font-size:11px;padding:3px 8px;border-radius:4px;cursor:pointer">Clean offline</button>' : ''}
      <button onclick="loadSessions()" style="background:none;border:1px solid var(--border);color:var(--text-dim);font-family:var(--font);font-size:11px;padding:3px 8px;border-radius:4px;cursor:pointer">↻</button>
    </div>`;

    if (filtered.length === 0) {
      html += '<div style="padding:20px 12px;color:var(--text-dim);text-align:center">' +
        (sessions.length === 0 ? 'No Squad RC sessions found.' : 'No online sessions. Tap "Show offline" to see stale ones.') +
        '</div>';
    } else {
      html += filtered.map(s => `
        <div class="session-card" ${s.online ? 'data-session-url="' + escapeHtml(s.url) + '"' : ''}>
          <span class="status-dot ${s.online ? 'online' : 'offline'}"></span>
          <div class="info">
            <div class="repo">📦 ${escapeHtml(s.repo)}</div>
            <div class="branch">🌿 ${escapeHtml(s.branch)}</div>
            <div class="machine">💻 ${escapeHtml(s.machine)}</div>
          </div>
          ${s.online ? '<span class="arrow">→</span>' :
            '<button data-delete-id="' + escapeHtml(s.id) + '" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px" title="Remove">✕</button>'}
        </div>
      `).join('');
    }
    dashboard.innerHTML = html;
    // #16: XSS fix — use event delegation instead of inline onclick
    dashboard.querySelectorAll('.session-card[data-session-url]').forEach(function(card) {
      card.addEventListener('click', function() { openSession(card.dataset.sessionUrl); });
    });
    dashboard.querySelectorAll('[data-delete-id]').forEach(function(btn) {
      btn.addEventListener('click', function(e) { e.stopPropagation(); deleteSession(btn.dataset.deleteId); });
    });
  }

  window.openSession = (url) => {
    window.location.href = url;
  };

  window.toggleOffline = () => {
    showOffline = !showOffline;
    loadSessions();
  };

  window.cleanOffline = async () => {
    const resp = await fetch('/api/sessions');
    const data = await resp.json();
    const offline = (data.sessions || []).filter(s => !s.online);
    for (const s of offline) {
      await fetch('/api/sessions/' + s.id, { method: 'DELETE' });
    }
    loadSessions();
  };

  window.deleteSession = async (id) => {
    await fetch('/api/sessions/' + id, { method: 'DELETE' });
    loadSessions();
  };

  window.toggleView = () => {
    if (currentView === 'terminal') {
      currentView = 'dashboard';
      terminal.classList.add('hidden');
      termContainer.classList.add('hidden');
      $('#input-area').classList.add('hidden');
      dashboard.classList.remove('hidden');
      $('#btn-sessions').textContent = 'Terminal';
      loadSessions();
    } else {
      currentView = 'terminal';
      dashboard.classList.add('hidden');
      $('#input-area').classList.remove('hidden');
      if (ptyMode) {
        termContainer.classList.remove('hidden');
        $('#input-form').classList.add('hidden');
        if (fitAddon) fitAddon.fit();
        if (xterm) xterm.focus();
      } else {
        terminal.classList.remove('hidden');
      }
      $('#btn-sessions').textContent = 'Sessions';
    }
  };

  // ─── Terminal Output ─────────────────────────────────────
  function writeSys(text) {
    const div = document.createElement('div');
    div.className = 'sys';
    div.textContent = text;
    terminal.appendChild(div);
    if (!replaying) scrollToBottom();
  }

  // ─── WebSocket ───────────────────────────────────────────
  async function connect() {
    const tokenParam = new URLSearchParams(window.location.search).get('token');
    if (!tokenParam) { setStatus('offline', 'No credentials'); return; }

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';

    // F-02: Try ticket-based auth first
    try {
      const resp = await fetch('/api/auth/ticket', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + tokenParam }
      });
      if (resp.ok) {
        const { ticket } = await resp.json();
        ws = new WebSocket(`${proto}//${location.host}?ticket=${encodeURIComponent(ticket)}`);
      } else {
        // Fallback to token-in-URL (backward compat)
        ws = new WebSocket(`${proto}//${location.host}?token=${encodeURIComponent(tokenParam)}`);
      }
    } catch {
      // Fallback to token-in-URL
      ws = new WebSocket(`${proto}//${location.host}?token=${encodeURIComponent(tokenParam)}`);
    }
    setStatus('connecting', 'Connecting...');

    ws.onopen = () => {
      connected = true;
      reconnectDelay = 1000;
      setStatus('online', 'Connected — waiting for terminal...');
    };
    ws.onclose = () => {
      connected = false;
      setStatus('offline', 'Disconnected');
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      setTimeout(connect, reconnectDelay);
    };
    ws.onerror = () => setStatus('offline', 'Error');
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleMessage(msg);
      } catch {}
    };
  }

  // ─── Message Handler ─────────────────────────────────────
  function handleMessage(msg) {
    // Replay events from bridge recording
    if (msg.type === '_replay') {
      replaying = true;
      try { handleMessage(JSON.parse(msg.data)); } catch {}
      return;
    }
    if (msg.type === '_replay_done') {
      replaying = false;
      scrollToBottom();
      return;
    }

    // PTY data — raw terminal output → xterm.js
    if (msg.type === 'pty') {
      if (!ptyMode) {
        ptyMode = true;
        setStatus('online', 'PTY Mirror');
        terminal.classList.add('hidden');
        // Hide text input form but keep key bar visible
        $('#input-form').classList.add('hidden');
        termContainer.classList.remove('hidden');
        initXterm();
      }
      xterm.write(msg.data);
      return;
    }

    // Clear screen detection
    if (msg.type === 'clear') {
      if (xterm) xterm.clear();
      return;
    }
  }

  // ─── Mobile Key Bar ───────────────────────────────────────
  let ptyMode = false;

  window.sendKey = (key) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'pty_input', data: key }));
    }
    if (xterm) xterm.focus();
  };

  // Event delegation for key-bar buttons (no inline onclick)
  var keyBar = document.getElementById('key-bar');
  if (keyBar) {
    var keyMap = {
      '\\x1b[A': '\x1b[A', '\\x1b[B': '\x1b[B', '\\x1b[C': '\x1b[C', '\\x1b[D': '\x1b[D',
      '\\t': '\t', '\\r': '\r', '\\x1b': '\x1b', '\\x03': '\x03', ' ': ' ', '\\x7f': '\x7f',
    };
    keyBar.addEventListener('click', function(e) {
      var btn = e.target;
      if (btn && btn.tagName === 'BUTTON' && btn.dataset.key) {
        var key = keyMap[btn.dataset.key] || btn.dataset.key;
        window.sendKey(key);
      }
    });
  }

  // Event listener for btn-sessions (no inline onclick)
  var btnSessions = document.getElementById('btn-sessions');
  if (btnSessions) {
    btnSessions.addEventListener('click', function() { window.toggleView(); });
  }

  // Form submit — in PTY mode, just focus xterm
  formEl.addEventListener('submit', function(e) {
    e.preventDefault();
    if (xterm) xterm.focus();
  });

  // ─── Helpers ─────────────────────────────────────────────
  function setStatus(state, text) {
    statusEl.className = state;
    statusText.textContent = text;
  }
  function scrollToBottom() {
    requestAnimationFrame(() => { terminal.scrollTop = terminal.scrollHeight; });
  }
  function escapeHtml(s) {
    var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  }

  // ─── Start ───────────────────────────────────────────────
  writeSys('Squad Remote Control');
  connect();
})();

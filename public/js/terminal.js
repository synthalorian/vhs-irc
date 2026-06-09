/**
 * vhs-irc Terminal Client
 * xterm.js frontend with retro CRT theme
 */

(function() {
  'use strict';

  // Terminal configuration
  const TERM_CONFIG = {
    cursorBlink: true,
    cursorStyle: 'block',
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: 14,
    theme: {
      background: '#0a0a0a',
      foreground: '#33ff33',
      cursor: '#33ff33',
      selectionBackground: 'rgba(51, 255, 51, 0.3)',
      black: '#0a0a0a',
      red: '#ff5555',
      green: '#33ff33',
      yellow: '#ffff55',
      blue: '#5555ff',
      magenta: '#ff55ff',
      cyan: '#55ffff',
      white: '#cccccc',
      brightBlack: '#555555',
      brightRed: '#ff8888',
      brightGreen: '#66ff66',
      brightYellow: '#ffff88',
      brightBlue: '#8888ff',
      brightMagenta: '#ff88ff',
      brightCyan: '#88ffff',
      brightWhite: '#ffffff',
    },
    scrollback: 10000,
    convertEol: true,
    allowTransparency: true,
  };

  let terminal = null;
  let fitAddon = null;
  let socket = null;
  let connected = false;
  let currentNick = null;
  let currentChannel = null;
  let inputBuffer = '';
  let cursorPosition = 0;
  let messageHistory = [];
  let historyIndex = -1;
  const statusEl = document.getElementById('connection-status');
  let fileInput = null;

  // ─── Initialize Terminal ───

  function initTerminal() {
    terminal = new Terminal(TERM_CONFIG);
    fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);

    const container = document.getElementById('terminal');
    terminal.open(container);
    fitAddon.fit();

    // Print welcome banner
    printBanner();
    prompt();

    // Handle user input
    terminal.onData(handleInput);

    // Handle resize
    window.addEventListener('resize', () => {
      fitAddon.fit();
    });

    // Auto-connect to WebSocket
    connectWebSocket();
  }

  function printBanner() {
    const lines = [
      '',
      '  ██╗   ██╗██╗  ██╗███████╗    ██╗██████╗  ██████╗',
      '  ██║   ██║██║  ██║██╔════╝    ██║██╔══██╗██╔════╝',
      '  ██║   ██║███████║███████╗    ██║██████╔╝██║     ',
      '  ╚██╗ ██╔╝██╔══██║╚════██║    ██║██╔══██╗██║     ',
      '   ╚████╔╝ ██║  ██║███████║    ██║██║  ██║╚██████╗',
      '    ╚═══╝  ╚═╝  ╚═╝╚══════╝    ╚═╝╚═╝  ╚═╝ ╚═════╝',
      '',
      '  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '  Retro Terminal IRC Client',
      '  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ];
    for (const line of lines) {
      terminal.writeln(`\x1b[32m${line}\x1b[0m`);
    }
    printHelp();
  }

  function printHelp() {
    terminal.writeln('  \x1b[1;32mCommands:\x1b[0m');
    terminal.writeln('    /connect <server> [port]  ─ Connect to IRC server');
    terminal.writeln('    /nick <nickname>          ─ Set your nickname');
    terminal.writeln('    /join <channel>           ─ Join a channel');
    terminal.writeln('    /part [channel]           ─ Leave a channel');
    terminal.writeln('    /msg <nick> <message>     ─ Send private message');
    terminal.writeln('    /quit [message]           ─ Disconnect from server');
    terminal.writeln('    /whois <nick>             ─ Get user info');
    terminal.writeln('    /me <action>              ─ Send action message');
    terminal.writeln('    /upload                   ─ Upload a file');
    terminal.writeln('    /help                     ─ Show this help');
    terminal.writeln('    /clear                    ─ Clear terminal');
    terminal.writeln('');
  }

  function prompt() {
    const nick = currentNick || 'guest';
    const chan = currentChannel || '';
    const prefix = chan ? `[${nick}:${chan}]` : `[${nick}]`;
    terminal.write(`\r\n\x1b[1;32m${prefix}\x1b[0m > `);
  }

  // ─── Input Handling ───

  function handleInput(data) {
    const code = data.charCodeAt(0);

    // Enter
    if (data === '\r' || data === '\n') {
      terminal.write('\r\n');
      const line = inputBuffer.trim();
      if (line) {
        messageHistory.push(line);
        historyIndex = messageHistory.length;
        processCommand(line);
      }
      inputBuffer = '';
      cursorPosition = 0;
      prompt();
      return;
    }

    // Backspace / Ctrl+H
    if (data === '\x7f' || data === '\b') {
      if (cursorPosition > 0) {
        inputBuffer = inputBuffer.slice(0, cursorPosition - 1) + inputBuffer.slice(cursorPosition);
        cursorPosition--;
        redrawInput();
      }
      return;
    }

    // Ctrl+C
    if (data === '\x03') {
      inputBuffer = '';
      cursorPosition = 0;
      terminal.write('^C');
      prompt();
      return;
    }

    // Ctrl+L (clear)
    if (data === '\x0c') {
      terminal.clear();
      prompt();
      return;
    }

    // Ctrl+A (beginning of line)
    if (data === '\x01') {
      cursorPosition = 0;
      redrawInput();
      return;
    }

    // Ctrl+E (end of line)
    if (data === '\x05') {
      cursorPosition = inputBuffer.length;
      redrawInput();
      return;
    }

    // Arrow keys (ESC sequences)
    if (data === '\x1b') {
      // We need more bytes, but xterm handles these via onKey
      return;
    }

    // Up arrow - history previous
    if (data === '\x1b[A') {
      if (historyIndex > 0) {
        historyIndex--;
        inputBuffer = messageHistory[historyIndex] || '';
        cursorPosition = inputBuffer.length;
        redrawInput();
      }
      return;
    }

    // Down arrow - history next
    if (data === '\x1b[B') {
      if (historyIndex < messageHistory.length - 1) {
        historyIndex++;
        inputBuffer = messageHistory[historyIndex] || '';
        cursorPosition = inputBuffer.length;
        redrawInput();
      } else {
        historyIndex = messageHistory.length;
        inputBuffer = '';
        cursorPosition = 0;
        redrawInput();
      }
      return;
    }

    // Left arrow
    if (data === '\x1b[D') {
      if (cursorPosition > 0) {
        cursorPosition--;
        redrawInput();
      }
      return;
    }

    // Right arrow
    if (data === '\x1b[C') {
      if (cursorPosition < inputBuffer.length) {
        cursorPosition++;
        redrawInput();
      }
      return;
    }

    // Regular character
    if (code >= 32 && code < 127) {
      inputBuffer = inputBuffer.slice(0, cursorPosition) + data + inputBuffer.slice(cursorPosition);
      cursorPosition++;
      redrawInput();
    }
  }

  function redrawInput() {
    // Clear current line and redraw
    const nick = currentNick || 'guest';
    const chan = currentChannel || '';
    const prefix = chan ? `[${nick}:${chan}]` : `[${nick}]`;
    const promptStr = `${prefix} > `;

    terminal.write(`\r\x1b[K\x1b[1;32m${promptStr}\x1b[0m${inputBuffer}`);

    // Move cursor to correct position
    const cursorOffset = inputBuffer.length - cursorPosition;
    if (cursorOffset > 0) {
      terminal.write(`\x1b[${cursorOffset}D`);
    }
  }

  // ─── Command Processing ───

  function processCommand(line) {
    if (!line.startsWith('/')) {
      // Send as message to current channel
      if (currentChannel) {
        sendIrcMessage('PRIVMSG', [currentChannel, line]);
        printMessage(currentNick, currentChannel, line);
      } else {
        printSystem('No channel joined. Use /join #channel');
      }
      return;
    }

    const parts = line.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'connect':
        handleConnect(args);
        break;
      case 'nick':
        handleNick(args);
        break;
      case 'join':
        handleJoin(args);
        break;
      case 'part':
        handlePart(args);
        break;
      case 'msg':
        handleMsg(args);
        break;
      case 'quit':
        handleQuit(args);
        break;
      case 'whois':
        sendIrcMessage('WHOIS', args);
        break;
      case 'me':
        handleMe(args);
        break;
      case 'upload':
        handleUpload();
        break;
      case 'topic':
        sendIrcMessage('TOPIC', args);
        break;
      case 'list':
        sendIrcMessage('LIST', args);
        break;
      case 'names':
        sendIrcMessage('NAMES', args.length ? args : [currentChannel]);
        break;
      case 'away':
        sendIrcMessage('AWAY', args);
        break;
      case 'help':
        printHelp();
        break;
      case 'clear':
        terminal.clear();
        break;
      default:
        printSystem(`Unknown command: /${cmd}. Type /help for available commands.`);
    }
  }

  function handleConnect(args) {
    if (!args[0]) {
      printSystem('Usage: /connect <server> [port]');
      return;
    }
    const server = args[0];
    const port = args[1] || '6667';
    printSystem(`Connecting to ${server}:${port}...`);
    sendIrcMessage('CONNECT', [server, port]);
  }

  function handleNick(args) {
    if (!args[0]) {
      printSystem('Usage: /nick <nickname>');
      return;
    }
    const nick = args[0];
    sendIrcMessage('NICK', [nick]);
    currentNick = nick;
    printSystem(`Nickname set to ${nick}`);
  }

  function handleJoin(args) {
    if (!args[0]) {
      printSystem('Usage: /join #channel');
      return;
    }
    const channel = args[0];
    sendIrcMessage('JOIN', [channel]);
    currentChannel = channel;
    printSystem(`Joining ${channel}...`);
  }

  function handlePart(args) {
    const channel = args[0] || currentChannel;
    if (!channel) {
      printSystem('Usage: /part [channel]');
      return;
    }
    sendIrcMessage('PART', [channel]);
    if (currentChannel === channel) {
      currentChannel = null;
    }
    printSystem(`Leaving ${channel}...`);
  }

  function handleMsg(args) {
    if (args.length < 2) {
      printSystem('Usage: /msg <nick> <message>');
      return;
    }
    const nick = args[0];
    const message = args.slice(1).join(' ');
    sendIrcMessage('PRIVMSG', [nick, message]);
    printPrivateMessage(currentNick, nick, message);
  }

  function handleQuit(args) {
    const message = args.join(' ') || 'vhs-irc client';
    sendIrcMessage('QUIT', [message]);
    printSystem(`Quitting: ${message}`);
    currentChannel = null;
  }

  function handleMe(args) {
    if (!args.length) {
      printSystem('Usage: /me <action>');
      return;
    }
    const action = args.join(' ');
    const target = currentChannel;
    if (!target) {
      printSystem('No channel joined. Use /join #channel');
      return;
    }
    sendIrcMessage('PRIVMSG', [target, `\x01ACTION ${action}\x01`]);
    printAction(currentNick, target, action);
  }

  function handleUpload() {
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        uploadFile(file);
        fileInput.value = '';
      });
      document.body.appendChild(fileInput);
    }
    fileInput.click();
  }

  async function uploadFile(file) {
    try {
      printSystem(`Uploading ${file.name}...`);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('nick', currentNick || 'anonymous');
      if (currentChannel) {
        formData.append('channel', currentChannel);
      }
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Upload failed' }));
        printError(err.error || 'Upload failed');
        return;
      }
      const result = await response.json();
      printSystem(`Upload complete: ${result.filename}`);
      if (result.mimeType?.startsWith('image/')) {
        printImagePreview(result.url, result.filename);
      } else {
        printFileLink(result.url, result.filename, result.size);
      }
    } catch (err) {
      printError(`Upload failed: ${err.message}`);
    }
  }

  function printImagePreview(url, filename) {
    const timestamp = getTimestamp();
    terminal.writeln(`\x1b[90m${timestamp}\x1b[0m \x1b[36m[FILE]\x1b[0m ${escapeAnsi(filename)}`);
    const container = document.getElementById('terminal');
    const imgContainer = document.createElement('div');
    imgContainer.className = 'file-preview';
    const img = document.createElement('img');
    img.src = url;
    img.alt = filename;
    img.className = 'file-preview-image';
    imgContainer.appendChild(img);
    container.appendChild(imgContainer);
    terminal.scrollToBottom();
  }

  function printFileLink(url, filename, size) {
    const timestamp = getTimestamp();
    const sizeStr = formatFileSize(size);
    terminal.writeln(`\x1b[90m${timestamp}\x1b[0m \x1b[36m[FILE]\x1b[0m ${escapeAnsi(filename)} (${sizeStr})`);
    terminal.writeln(`  \x1b[34m${escapeAnsi(url)}\x1b[0m`);
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  // ─── WebSocket ───

  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        connected = true;
        updateStatus(true);
        printSystem('Connected to vhs-irc server');
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleIrcMessage(msg);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      };

      socket.onclose = () => {
        connected = false;
        updateStatus(false);
        printSystem('Disconnected from server. Reconnecting in 3s...');
        setTimeout(connectWebSocket, 3000);
      };

      socket.onerror = (err) => {
        console.error('WebSocket error:', err);
        printSystem('Connection error');
      };
    } catch (err) {
      printSystem(`Failed to connect: ${err.message}`);
      setTimeout(connectWebSocket, 5000);
    }
  }

  function sendIrcMessage(command, params = []) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      printSystem('Not connected to server');
      return;
    }
    const msg = { command, params };
    socket.send(JSON.stringify(msg));
  }

  function updateStatus(isConnected) {
    if (statusEl) {
      statusEl.textContent = isConnected ? '● connected' : '● disconnected';
      statusEl.className = 'crt-status' + (isConnected ? ' connected' : '');
    }
  }

  // ─── Message Formatting ───

  function handleIrcMessage(msg) {
    const { command, params, prefix } = msg;

    switch (command) {
      case 'WELCOME':
        printSystem(params[0] || 'Welcome to vhs-irc');
        break;

      case 'PRIVMSG': {
        const target = params[0];
        const text = params[1] || '';
        const nick = prefix?.nick || 'unknown';

        if (text.startsWith('\x01ACTION ') && text.endsWith('\x01')) {
          const action = text.slice(8, -1);
          printAction(nick, target, action);
        } else {
          printMessage(nick, target, text);
        }
        break;
      }

      case 'JOIN': {
        const channel = params[0];
        const nick = prefix?.nick || 'unknown';
        if (nick === currentNick) {
          currentChannel = channel;
          printSystem(`You joined ${channel}`);
        } else {
          printSystem(`→ ${nick} joined ${channel}`);
        }
        break;
      }

      case 'PART': {
        const channel = params[0];
        const nick = prefix?.nick || 'unknown';
        const reason = params[1] || '';
        if (nick === currentNick) {
          currentChannel = null;
        }
        printSystem(`← ${nick} left ${channel}${reason ? ` (${reason})` : ''}`);
        break;
      }

      case 'QUIT': {
        const nick = prefix?.nick || 'unknown';
        const reason = params[0] || '';
        printSystem(`← ${nick} quit${reason ? ` (${reason})` : ''}`);
        break;
      }

      case 'NICK': {
        const oldNick = prefix?.nick || 'unknown';
        const newNick = params[0];
        if (oldNick === currentNick) {
          currentNick = newNick;
        }
        printSystem(`◆ ${oldNick} is now known as ${newNick}`);
        break;
      }

      case 'TOPIC': {
        const channel = params[0];
        const topic = params[1] || '';
        printSystem(`ℹ Topic for ${channel}: ${topic}`);
        break;
      }

      case 'MODE': {
        const target = params[0];
        const modes = params.slice(1).join(' ');
        const nick = prefix?.nick || 'server';
        printSystem(`⚡ ${nick} set mode ${modes} on ${target}`);
        break;
      }

      case 'KICK': {
        const channel = params[0];
        const kicked = params[1];
        const kicker = prefix?.nick || 'unknown';
        const reason = params[2] || '';
        printSystem(`⚠ ${kicker} kicked ${kicked} from ${channel}${reason ? `: ${reason}` : ''}`);
        break;
      }

      case 'NOTICE': {
        const text = params.join(' ');
        printNotice(text);
        break;
      }

      case 'ERROR': {
        const text = params.join(' ');
        printError(text);
        break;
      }

      case 'PING':
        sendIrcMessage('PONG', params);
        break;

      case 'FILE_SHARE': {
        const nick = params[0] || 'unknown';
        const channel = params[1] || '';
        const filename = params[2] || '';
        const url = params[3] || '';
        const mimeType = params[4] || '';
        const size = parseInt(params[5] || '0', 10);
        if (mimeType.startsWith('image/')) {
          printImagePreview(url, `${nick} shared: ${filename}`);
        } else {
          printFileLink(url, `${nick} shared: ${filename}`, size);
        }
        break;
      }

      default:
        // Numeric replies
        if (/^\d{3}$/.test(command)) {
          const text = params.slice(1).join(' ');
          printNumeric(command, text);
        } else {
          printDebug(command, params);
        }
    }
  }

  // ─── Print Functions ───

  function printMessage(nick, target, text) {
    const timestamp = getTimestamp();
    const isPrivate = !target?.startsWith('#');
    const targetLabel = isPrivate ? '(priv)' : target;
    terminal.writeln(`\x1b[90m${timestamp}\x1b[0m <\x1b[36m${nick}\x1b[0m:${targetLabel}> ${escapeAnsi(text)}`);
  }

  function printPrivateMessage(from, to, text) {
    const timestamp = getTimestamp();
    terminal.writeln(`\x1b[90m${timestamp}\x1b[0m [\x1b[35mpriv\x1b[0m] <\x1b[36m${from}\x1b[0m → ${to}> ${escapeAnsi(text)}`);
  }

  function printAction(nick, target, action) {
    const timestamp = getTimestamp();
    terminal.writeln(`\x1b[90m${timestamp}\x1b[0m * \x1b[33m${nick}\x1b[0m ${escapeAnsi(action)}`);
  }

  function printSystem(text) {
    const timestamp = getTimestamp();
    terminal.writeln(`\x1b[90m${timestamp}\x1b[0m \x1b[32m[SYSTEM]\x1b[0m ${escapeAnsi(text)}`);
  }

  function printNotice(text) {
    const timestamp = getTimestamp();
    terminal.writeln(`\x1b[90m${timestamp}\x1b[0m \x1b[33m[NOTICE]\x1b[0m ${escapeAnsi(text)}`);
  }

  function printError(text) {
    const timestamp = getTimestamp();
    terminal.writeln(`\x1b[90m${timestamp}\x1b[0m \x1b[31m[ERROR]\x1b[0m ${escapeAnsi(text)}`);
  }

  function printNumeric(code, text) {
    const timestamp = getTimestamp();
    terminal.writeln(`\x1b[90m${timestamp}\x1b[0m \x1b[34m[${code}]\x1b[0m ${escapeAnsi(text)}`);
  }

  function printDebug(command, params) {
    const timestamp = getTimestamp();
    const paramStr = params ? params.join(' ') : '';
    terminal.writeln(`\x1b[90m${timestamp}\x1b[0m \x1b[90m[${command}] ${escapeAnsi(paramStr)}\x1b[0m`);
  }

  function getTimestamp() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function escapeAnsi(text) {
    if (!text) return '';
    return text.replace(/\x1b/g, '');
  }

  // ─── Start ───

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTerminal);
  } else {
    initTerminal();
  }
})();

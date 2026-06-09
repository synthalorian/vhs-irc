import { IrcMessage, IrcPrefix } from './types';

export class IrcParseError extends Error {
  constructor(message: string, public readonly raw?: string) {
    super(message);
    this.name = 'IrcParseError';
  }
}

/**
 * Parse an IRC message line per RFC 2812.
 *
 * Format: [:prefix] COMMAND [params...] [:trailing]\r\n
 *
 * Examples:
 *   :nick!user@host PRIVMSG #channel :Hello world\r\n
 *   PING :server.name\r\n
 *   :server 001 nick :Welcome to IRC\r\n
 */
export function parseLine(line: string): IrcMessage {
  const trimmed = line.trimEnd();
  const raw = trimmed;

  let pos = 0;

  // Parse prefix
  let prefix: IrcPrefix | undefined;
  if (trimmed.startsWith(':')) {
    const spaceIdx = trimmed.indexOf(' ', 1);
    if (spaceIdx === -1) {
      throw new IrcParseError('Prefix without command', raw);
    }
    const prefixStr = trimmed.slice(1, spaceIdx);
    prefix = parsePrefix(prefixStr);
    pos = spaceIdx + 1;
  }

  // Skip leading spaces
  while (pos < trimmed.length && trimmed[pos] === ' ') {
    pos++;
  }

  if (pos >= trimmed.length) {
    throw new IrcParseError('Missing command', raw);
  }

  // Parse command
  let cmdEnd = pos;
  while (cmdEnd < trimmed.length && trimmed[cmdEnd] !== ' ') {
    cmdEnd++;
  }
  const command = trimmed.slice(pos, cmdEnd).toUpperCase();

  if (!command) {
    throw new IrcParseError('Empty command', raw);
  }

  if (command.length === 3 && /^\d{3}$/.test(command)) {
    // Numeric reply — keep as-is
  } else if (!/^[A-Za-z]+$/.test(command)) {
    throw new IrcParseError(`Invalid command: ${command}`, raw);
  }

  pos = cmdEnd;

  // Parse parameters
  const params: string[] = [];

  while (pos < trimmed.length) {
    // Skip spaces
    while (pos < trimmed.length && trimmed[pos] === ' ') {
      pos++;
    }
    if (pos >= trimmed.length) break;

    if (trimmed[pos] === ':') {
      // Trailing parameter (includes the rest of the line)
      params.push(trimmed.slice(pos + 1));
      break;
    }

    // Middle parameter
    let paramEnd = pos;
    while (paramEnd < trimmed.length && trimmed[paramEnd] !== ' ') {
      paramEnd++;
    }
    params.push(trimmed.slice(pos, paramEnd));
    pos = paramEnd;
  }

  return {
    raw,
    prefix,
    command,
    params,
  };
}

/**
 * Parse an IRC prefix string.
 *
 * Formats:
 *   nick!user@host
 *   nick@host
 *   server.name
 */
function parsePrefix(prefixStr: string): IrcPrefix {
  const prefix: IrcPrefix = { raw: prefixStr };

  // Check for ! which indicates nick!user@host format
  const bangIdx = prefixStr.indexOf('!');
  const atIdx = prefixStr.indexOf('@');

  if (bangIdx !== -1 && atIdx !== -1 && atIdx > bangIdx) {
    // nick!user@host
    prefix.nick = prefixStr.slice(0, bangIdx);
    prefix.user = prefixStr.slice(bangIdx + 1, atIdx);
    prefix.host = prefixStr.slice(atIdx + 1);
  } else if (atIdx !== -1) {
    // nick@host (rare but valid)
    prefix.nick = prefixStr.slice(0, atIdx);
    prefix.host = prefixStr.slice(atIdx + 1);
  } else if (prefixStr.includes('.')) {
    // Server name (contains dot)
    prefix.server = prefixStr;
  } else {
    // Just a nick
    prefix.nick = prefixStr;
  }

  return prefix;
}

/**
 * Parse multiple lines from a buffer.
 * Handles partial lines (returns unparsed remainder).
 */
export function parseBuffer(data: string): { messages: IrcMessage[]; remainder: string } {
  const messages: IrcMessage[] = [];
  const lines = data.split('\r\n');

  // The last element is either empty (complete message) or a partial line
  const remainder = lines.pop() || '';

  for (const line of lines) {
    if (line) {
      try {
        messages.push(parseLine(line));
      } catch (err) {
        // Skip malformed lines but preserve error info
        messages.push({
          raw: line,
          command: 'PARSE_ERROR',
          params: [err instanceof Error ? err.message : 'Unknown parse error'],
        });
      }
    }
  }

  return { messages, remainder };
}

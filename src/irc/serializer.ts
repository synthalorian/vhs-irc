import { IrcMessage } from './types';

/**
 * Serialize an IRC message object back to wire format.
 *
 * Format: [:prefix] COMMAND [params...] [:trailing]\r\n
 */
export function serializeMessage(msg: IrcMessage): string {
  const parts: string[] = [];

  if (msg.prefix) {
    parts.push(`:${msg.prefix.raw}`);
  }

  parts.push(msg.command);

  if (msg.params.length > 0) {
    const lastIdx = msg.params.length - 1;

    for (let i = 0; i < lastIdx; i++) {
      const param = msg.params[i];
      if (param.includes(' ') || param.startsWith(':')) {
        throw new Error(`Middle parameter cannot contain spaces or start with colon: ${param}`);
      }
      parts.push(param);
    }

    const lastParam = msg.params[lastIdx];
    if (lastParam.includes(' ') || lastParam.startsWith(':') || lastParam === '') {
      parts.push(`:${lastParam}`);
    } else {
      parts.push(lastParam);
    }
  }

  return parts.join(' ') + '\r\n';
}

/**
 * Create a simple IRC message without a prefix.
 */
export function makeMessage(command: string, ...params: string[]): IrcMessage {
  return {
    command: command.toUpperCase(),
    params,
  };
}

/**
 * Create a user-targeted IRC message (PRIVMSG, NOTICE, etc.)
 */
export function makeTargetMessage(
  command: string,
  target: string,
  text: string
): IrcMessage {
  return {
    command: command.toUpperCase(),
    params: [target, text],
  };
}

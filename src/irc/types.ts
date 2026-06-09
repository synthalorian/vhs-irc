/**
 * IRC Protocol Types (RFC 2812)
 */

export interface IrcPrefix {
  raw: string;
  nick?: string;
  user?: string;
  host?: string;
  server?: string;
}

export interface IrcMessage {
  raw?: string;
  prefix?: IrcPrefix;
  command: string;
  params: string[];
}

export type IrcCommand =
  // Connection registration
  | 'PASS' | 'NICK' | 'USER' | 'OPER' | 'MODE' | 'SERVICE' | 'QUIT'
  // Channel operations
  | 'JOIN' | 'PART' | 'TOPIC' | 'NAMES' | 'LIST' | 'INVITE' | 'KICK'
  // Server queries
  | 'MOTD' | 'VERSION' | 'STATS' | 'LINKS' | 'TIME' | 'CONNECT'
  | 'TRACE' | 'ADMIN' | 'INFO' | 'SERVLIST' | 'SQUERY'
  // Sending messages
  | 'PRIVMSG' | 'NOTICE' | 'WHO' | 'WHOIS' | 'WHOWAS'
  // Miscellaneous
  | 'KILL' | 'PING' | 'PONG' | 'ERROR' | 'AWAY' | 'REHASH'
  | 'DIE' | 'RESTART' | 'SUMMON' | 'USERS' | 'WALLOPS'
  | 'USERHOST' | 'ISON'
  // Numeric replies
  | string;

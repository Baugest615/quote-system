/**
 * Logger — 彩色終端輸出工具
 */

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
} as const;

export const logger = {
  info: (msg: string) => console.log(`${COLORS.blue}ℹ${COLORS.reset} ${msg}`),
  success: (msg: string) => console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`),
  warn: (msg: string) => console.log(`${COLORS.yellow}⚠${COLORS.reset} ${msg}`),
  error: (msg: string) => console.log(`${COLORS.red}✗${COLORS.reset} ${msg}`),
  agent: (name: string, msg: string) =>
    console.log(`${COLORS.magenta}[${name}]${COLORS.reset} ${msg}`),
  header: (msg: string) =>
    console.log(`\n${COLORS.bold}${COLORS.cyan}${msg}${COLORS.reset}\n`),
  divider: () => console.log(`${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}`),
};

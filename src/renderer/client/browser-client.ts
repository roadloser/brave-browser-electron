import type { BrowserBridge, BrowserEvents, CommandInput, CommandName, CommandResults, EventName } from '../../shared/contracts/envelope';
import type { WireError } from '../../shared/errors';

declare global {
  interface Window { browser: BrowserBridge }
}

export class BrowserClientError extends Error {
  constructor(public readonly problem: WireError) {
    super(problem.message);
    this.name = 'BrowserClientError';
  }
}

export const browserClient = {
  async command<Name extends CommandName>(name: Name, payload: CommandInput<Name>): Promise<CommandResults[Name]> {
    if (!window.browser) throw new Error('浏览器管理连接尚未建立');
    const result = await window.browser.command(name, payload);
    if (!result.ok) throw new BrowserClientError(result.error);
    return result.value;
  },
  on<Name extends EventName>(name: Name, listener: (data: BrowserEvents[Name]) => void) {
    return window.browser.subscribe(name, listener);
  },
};

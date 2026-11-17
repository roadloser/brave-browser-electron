import { BrowserError } from '../../../shared/errors';

export type ControlReply = { code: number; lines: string[] };
export class ControlProtocol {
  private buffer = '';
  private lines: string[] = [];
  private code = 0;
  private dataBlock = false;
  constructor(private readonly receive: (reply: ControlReply) => void) {}
  push(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    if (this.buffer.length > 1024 * 1024) throw new BrowserError('UNAVAILABLE', 'Tor 控制响应超过限制');
    for (;;) {
      const newline = this.buffer.indexOf('\r\n');
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline); this.buffer = this.buffer.slice(newline + 2);
      if (this.dataBlock) {
        if (line === '.') this.dataBlock = false;
        else this.lines.push(line.startsWith('..') ? line.slice(1) : line);
        continue;
      }
      const match = /^(\d{3})([ +\-])(.*)$/.exec(line);
      if (!match) throw new BrowserError('UNAVAILABLE', 'Tor 控制响应格式不正确');
      const code = Number(match[1]);
      if (code === 650 && this.lines.length && this.code !== 650) {
        this.receive({ code, lines: [match[3]] }); continue;
      }
      this.code = code; this.lines.push(match[3]);
      if (match[2] === '+') this.dataBlock = true;
      if (match[2] === ' ') {
        const reply = { code: this.code, lines: this.lines };
        this.lines = []; this.receive(reply);
      }
    }
  }
}

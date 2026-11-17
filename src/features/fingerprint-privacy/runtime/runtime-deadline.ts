export class RuntimeDeadline {
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(milliseconds: number, expired: () => void) {
    this.timer = setTimeout(() => {
      this.controller.abort();
      expired();
    }, milliseconds);
  }

  get signal(): AbortSignal { return this.controller.signal; }
  assertActive(): void {
    if (this.controller.signal.aborted) throw new Error('指纹初始化已超时，不能登记为首读已保护');
  }
  dispose(): void { clearTimeout(this.timer); this.controller.abort(); }
}

export function assertRuntimeActive(signal: AbortSignal | undefined, disposed: boolean): void {
  if (disposed || signal?.aborted) throw new Error('指纹初始化已取消或超时，后续结果已丢弃');
}

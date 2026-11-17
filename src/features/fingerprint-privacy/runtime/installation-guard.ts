export type InstallationTarget = { object: object | null | undefined; properties: string[]; inherited?: boolean };
export type InstallationReport = { coveredApis: string[]; failures: string[] };

export function guardInstallation(name: string, targets: InstallationTarget[], install: () => InstallationReport): InstallationReport {
  const snapshots: { object: object; name: string; descriptor?: PropertyDescriptor }[] = [];
  for (const target of targets) {
    if (!target.object) continue;
    for (const property of target.properties) {
      let object: object = target.object;
      if (target.inherited) {
        let current: object | null = object;
        while (current && !Object.prototype.hasOwnProperty.call(current, property)) current = Object.getPrototypeOf(current) as object | null;
        if (current) object = current;
      }
      if (snapshots.some(snapshot => snapshot.object === object && snapshot.name === property)) continue;
      snapshots.push({ object, name: property, descriptor: Object.getOwnPropertyDescriptor(object, property) });
    }
  }
  try { return install(); }
  catch (error) {
    const failures = [`${name}安装失败：${error instanceof Error ? error.message : 'unknown'}`];
    for (const snapshot of snapshots.reverse()) {
      try {
        if (snapshot.descriptor) Object.defineProperty(snapshot.object, snapshot.name, snapshot.descriptor);
        else if (!Reflect.deleteProperty(snapshot.object, snapshot.name)) throw new Error('无法删除新增descriptor');
      } catch { failures.push(`${name}回滚失败：${snapshot.name}`); }
    }
    return { coveredApis: [], failures };
  }
}

export function globalPrototype(name: string): object | undefined {
  const candidate = (globalThis as unknown as Record<string, unknown>)[name];
  return typeof candidate === 'function' ? candidate.prototype as object : undefined;
}

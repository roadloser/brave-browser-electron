import type { TorComponent } from './component-descriptor';

export type TorEndpoint = { socksPort: number; version: string };
export type TorBootstrap = { progress: number; summary: string; circuitEstablished: boolean };
export interface TorRuntimePort {
  start(component: TorComponent, signal: AbortSignal): Promise<TorEndpoint>;
  enableNetwork(): Promise<void>;
  bootstrap(): Promise<TorBootstrap>;
  newIdentity(): Promise<void>;
  stop(): Promise<void>;
}

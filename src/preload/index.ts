import { contextBridge } from 'electron';
import { createBrowserBridge } from './browser-bridge';

contextBridge.exposeInMainWorld('browser', createBrowserBridge());

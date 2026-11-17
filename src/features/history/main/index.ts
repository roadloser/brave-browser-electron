import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { historyMigrations } from './schema';
import { HistoryService } from './service';
import { registerHistoryIpc } from './register-ipc';
import { registerVisitRecorder } from './visit-recorder';
import { createHistorySyncAdapter } from './sync-adapter';

export const historyFeature: FeatureDefinition = {
  id: 'history',
  migrations: historyMigrations,
  register(runtime) {
    const service = new HistoryService(runtime);
    const stopCommands = registerHistoryIpc(runtime, service);
    const stopRecording = registerVisitRecorder(runtime, service);
    const stopSync = runtime.syncData.register('history', createHistorySyncAdapter(runtime, service));
    return { id: 'history', dispose() { stopSync(); stopRecording(); stopCommands(); } };
  },
};

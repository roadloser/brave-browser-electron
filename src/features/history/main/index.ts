import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { historyMigrations } from './schema';
import { HistoryService } from './service';
import { registerHistoryIpc } from './register-ipc';
import { registerVisitRecorder } from './visit-recorder';
import { createHistorySyncAdapter } from './sync-adapter';
import { createHistoryReader } from './history-reader';

export const historyFeature: FeatureDefinition = {
  id: 'history',
  migrations: historyMigrations,
  register(runtime) {
    const service = new HistoryService(runtime);
    const stopCommands = registerHistoryIpc(runtime, service);
    const stopRecording = registerVisitRecorder(runtime, service);
    const stopSync = runtime.syncData.register('history', createHistorySyncAdapter(runtime, service));
    const stopRead = runtime.historyRead.register(createHistoryReader(runtime.storage));
    return { id: 'history', dispose() { stopRead(); stopSync(); stopRecording(); stopCommands(); } };
  },
};

import type { FeatureDefinition } from '../../../shared/module-lifecycle';
import { leoMigrations } from './conversation-repository';
import { ConversationService } from './conversation-service';

export const leoFeature: FeatureDefinition = {
  id: 'leo', migrations: leoMigrations,
  register(runtime) {
    const service = new ConversationService(runtime);
    const releases = [
      runtime.router.handle('leo.get', (_payload, context) => service.get(context)),
      runtime.router.handle('leo.saveModel', (payload, context) => service.saveModel(context, payload)),
      runtime.router.handle('leo.removeModel', (payload, context) => service.removeModel(context, payload.id)),
      runtime.router.handle('leo.grantContent', (payload, context) => service.grantContent(context, payload.tabId, payload.scope)),
      runtime.router.handle('leo.revokeContent', (payload, context) => service.revokeContent(context, payload.grantId)),
      runtime.router.handle('leo.chooseImages', (_payload, context) => service.chooseImages(context)),
      runtime.router.handle('leo.removeAttachment', (payload, context) => service.removeAttachment(context, payload.id)),
      runtime.router.handle('leo.respondTool', (payload, context) => service.respondTool(context, payload.requestId, payload.toolUseId, payload.choice, payload.reject)),
      runtime.router.handle('leo.send', (payload, context) => service.send(context, payload)),
      runtime.router.handle('leo.cancel', (payload, context) => service.cancel(context, payload.requestId)),
      runtime.router.handle('leo.removeConversation', (payload, context) => service.removeConversation(context, payload.id)),
      runtime.router.handle('leo.clearConversations', (_payload, context) => service.clearConversations(context)),
    ];
    return { id: 'leo', async dispose() { releases.forEach((release) => release()); await service.dispose(); } };
  },
};

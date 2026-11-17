import { useEffect, useRef, useState } from 'react';
import { FileText, ImagePlus, Plus, Send, Settings2, Square, Trash2, X } from 'lucide-react';
import type { TabSnapshot } from '../../../shared/contracts/browser-core';
import type { ContentGrant, LeoAttachment, ModelConfiguration } from '../../../shared/contracts/leo';
import { browserClient } from '../../../renderer/client/browser-client';
import { DockedPanel } from '../../../renderer/components/docked-panel';
import { ErrorNotice } from '../../../renderer/components/error-notice';
import { IconButton } from '../../../renderer/components/icon-button';
import { useLeo } from './conversation-store';
import { ModelEditor } from './model-editor';
import { ContentGrantDialog } from './content-grant';
import { ToolResult } from './tool-result';
import { AttachmentTray } from './attachment-tray';
import './leo.css';

export function LeoPanel({ tab, open, onOpenChange }: { tab: TabSnapshot; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, setState, error, setError } = useLeo(tab.contextId, open);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [modelId, setModelId] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [modelEditor, setModelEditor] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfiguration | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grant, setGrant] = useState<ContentGrant | null>(null);
  const [attachments, setAttachments] = useState<LeoAttachment[]>([]);
  const tail = useRef<HTMLDivElement>(null);
  const conversation = state?.conversations.find((entry) => entry.id === conversationId);
  const active = state?.activeRequests.find((entry) => entry.conversationId === conversationId && ['running', 'waiting-for-user'].includes(entry.status));
  const failed = state?.activeRequests.find((entry) => entry.conversationId === conversationId && entry.status === 'failed');
  useEffect(() => {
    setConversationId(null); setModelId(''); setGrant(null); setInput(''); setAttachments([]);
  }, [tab.contextId]);
  useEffect(() => {
    if (state?.models.length && !state.models.some((model) => model.id === modelId)) setModelId(state.models[0].id);
  }, [state?.models, modelId]);
  useEffect(() => {
    if (grant && (grant.tabId !== tab.id || grant.navigationId !== tab.navigationId || grant.expiresAt <= Date.now())) {
      browserClient.command('leo.revokeContent', { grantId: grant.id }).catch(() => undefined);
      setGrant(null);
    }
  }, [grant, tab.id, tab.navigationId]);
  useEffect(() => { tail.current?.scrollIntoView({ block: 'end' }); }, [conversation?.messages]);
  async function send() {
    if ((!input.trim() && !attachments.length) || !modelId || active || sending) return;
    setSending(true); setError('');
    try {
      const result = await browserClient.command('leo.send', {
        conversationId: conversationId ?? undefined, modelId, text: input.trim(), grantId: grant?.id, attachmentIds: attachments.map((attachment) => attachment.id),
      });
      setConversationId(result.conversationId); setInput(''); setGrant(null); setAttachments([]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setGrant(null); }
    finally { setSending(false); }
  }
  return (
    <>
      <DockedPanel open={open} onOpenChange={onOpenChange} title="Leo">
        <div className="leo-panel">
          <div className="leo-navigation">
            <select aria-label="历史对话" value={conversationId ?? ''} onChange={(event) => setConversationId(event.target.value || null)}>
              <option value="">新对话</option>{state?.conversations.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
            </select>
            <IconButton label="新建对话" onClick={() => { setConversationId(null); setError(''); }}><Plus size={17} /></IconButton>
            <IconButton label="删除此对话" disabled={!conversation} onClick={async () => {
              if (!conversation) return;
              try { setState(await browserClient.command('leo.removeConversation', { id: conversation.id })); setConversationId(null); }
              catch (failure) { setError(String(failure)); }
            }}><Trash2 size={15} /></IconButton>
          </div>
          <div className="leo-model-row">
            <select aria-label="模型" value={modelId} disabled={Boolean(active)} onChange={(event) => setModelId(event.target.value)}>
              {!state?.models.length && <option value="">添加模型以开始</option>}
              {state?.models.map((model) => <option key={model.id} value={model.id}>{model.name}{model.provider === 'brave' ? ' · 官方' : ' · 自定义'}</option>)}
            </select>
            <IconButton label="编辑当前模型" disabled={!modelId} onClick={() => { setEditingModel(state?.models.find((entry) => entry.id === modelId) ?? null); setModelEditor(true); }}><Settings2 size={16} /></IconButton>
            <IconButton label="添加模型" onClick={() => { setEditingModel(null); setModelEditor(true); }}><Plus size={16} /></IconButton>
          </div>
          <div className="leo-messages" aria-live="polite">
            {!conversation && <div className="leo-introduction"><h3>有什么可以帮您？</h3><p>提出问题，或授权当前页面后，让 Leo 帮您理解内容。</p><p className="leo-detail">{state?.official.reason}</p></div>}
            {conversation?.messages.map((message) => <div key={message.id} className={`leo-message role-${message.role}`}>
              <span className="leo-message-role">{message.role === 'user' ? '您' : 'Leo'}</span>
              <div>{message.content || (message.status === 'streaming' ? '正在思考…' : '')}</div>
              {message.attachments && <AttachmentTray attachments={message.attachments} />}
              {message.toolUses?.map((tool) => <ToolResult key={tool.id} tool={tool} requestId={active?.id} onChoice={setInput} onError={setError} />)}
              {message.status === 'cancelled' && <small>已停止生成</small>}
              {message.status === 'failed' && <small>此回答未完成</small>}
            </div>)}
            <div ref={tail} />
          </div>
          {(error || failed?.error) && <ErrorNotice message={error || failed?.error || ''} onDismiss={() => setError('')} />}
          <form className="leo-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <AttachmentTray attachments={attachments} onRemove={(id) => {
              browserClient.command('leo.removeAttachment', { id }).catch((failure) => setError(String(failure)));
              setAttachments((current) => current.filter((attachment) => attachment.id !== id));
            }} />
            {grant && <div className="leo-grant"><FileText size={14} /><span>{grant.title}</span><IconButton label="撤销页面授权" onClick={() => {
              browserClient.command('leo.revokeContent', { grantId: grant.id }).catch((failure) => setError(String(failure))); setGrant(null);
            }}><X size={13} /></IconButton></div>}
            <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="询问 Leo…" aria-label="消息"
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
            <div className="leo-composer-actions">
              <IconButton label="授权当前页面内容" disabled={!/^https?:/.test(tab.url) || Boolean(active)} onClick={() => setGrantOpen(true)}><FileText size={17} /></IconButton>
              <IconButton label="添加图片" disabled={Boolean(active) || !state?.models.find((model) => model.id === modelId)?.supportsVision}
                onClick={() => browserClient.command('leo.chooseImages', {}).then((images) => {
                  if (attachments.length + images.length > 8) {
                    images.forEach((image) => browserClient.command('leo.removeAttachment', { id: image.id }).catch(() => undefined));
                    setError('一次最多发送 8 张图片'); return;
                  }
                  setAttachments((current) => [...current, ...images]);
                }).catch((failure) => setError(String(failure)))}><ImagePlus size={17} /></IconButton>
              <span>{tab.isPrivate ? '私密对话不保存' : '页面内容需要单次授权'}</span>
              {active ? <IconButton label="停止生成" onClick={() => browserClient.command('leo.cancel', { requestId: active.id }).catch((failure) => setError(String(failure)))}><Square size={16} /></IconButton> :
                <IconButton label="发送" type="submit" disabled={sending || (!input.trim() && !attachments.length) || !modelId}><Send size={17} /></IconButton>}
            </div>
          </form>
        </div>
      </DockedPanel>
      <ModelEditor model={editingModel} open={modelEditor} onOpenChange={setModelEditor} onSaved={setState} />
      <ContentGrantDialog tab={tab} open={grantOpen} onOpenChange={setGrantOpen} onGrant={setGrant} />
    </>
  );
}

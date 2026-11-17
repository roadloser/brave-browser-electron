import type { LeoToolUse } from '../../../shared/contracts/leo';
import { browserClient } from '../../../renderer/client/browser-client';

export function ToolResult({ tool, requestId, onChoice, onError }: {
  tool: LeoToolUse; requestId?: string; onChoice: (choice: string) => void; onError: (message: string) => void;
}) {
  if (tool.name === 'assistant_detail_storage') return <details className="leo-tool-result"><summary>已保留对话要点</summary><p>{String(tool.input.information ?? '')}</p></details>;
  const choices = Array.isArray(tool.input.choices) ? tool.input.choices.filter((value): value is string => typeof value === 'string') : [];
  const followUp = tool.input.choice_type === 'follow_up';
  return (
    <div className="leo-tool-result">
      <p>{followUp ? '继续探索' : tool.status === 'pending' ? '请选择以继续' : '您的选择'}</p>
      {tool.output && !followUp ? <span>{tool.output}</span> :
        <div className="leo-tool-choices">{choices.map((choice) => <button type="button" className="button" key={choice}
          disabled={!followUp && (!requestId || tool.status !== 'pending')}
          onClick={() => {
            if (followUp) { onChoice(choice); return; }
            if (requestId) browserClient.command('leo.respondTool', { requestId, toolUseId: tool.id, choice, reject: false })
              .catch((failure) => onError(failure instanceof Error ? failure.message : String(failure)));
          }}>{choice}</button>)}</div>}
      {!followUp && tool.status === 'pending' && requestId && <button type="button" className="leo-tool-reject"
        onClick={() => browserClient.command('leo.respondTool', { requestId, toolUseId: tool.id, choice: '', reject: true }).catch((failure) => onError(String(failure)))}>跳过此问题</button>}
    </div>
  );
}

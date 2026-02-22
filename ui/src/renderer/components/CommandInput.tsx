/**
 * CommandInput component
 * Text input with agent selector for sending commands to the queue
 */

import React, { useState, KeyboardEvent } from 'react';
import { useCommandQueue } from '../hooks/useCommandQueue';
import { useAgents } from '../hooks/useAgents';

export const CommandInput: React.FC = () => {
  const [command, setCommand] = useState('');
  const [targetAgentId, setTargetAgentId] = useState<string | undefined>(
    undefined
  );
  const { sendCommand, isConnected, cliConnected, cliError } = useCommandQueue();
  const agents = useAgents();

  const handleSend = async () => {
    if (!command.trim() || !isConnected) return;

    await sendCommand(command.trim(), targetAgentId);
    setCommand('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Ctrl+Enter for new line
    if (e.key === 'Enter' && !e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="command-input-container">
      <div className="command-input-row">
        <select
          className="command-input-select"
          value={targetAgentId || ''}
          onChange={(e) =>
            setTargetAgentId(e.target.value || undefined)
          }
          disabled={!isConnected}
        >
          <option value="">All Agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.emoji} {agent.name}
            </option>
          ))}
        </select>

        <textarea
          className="command-input-textarea"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isConnected
              ? 'Type command... (Enter to send, Ctrl+Enter for new line)'
              : 'IPC not available'
          }
          disabled={!isConnected}
          rows={2}
        />

        <button
          className="command-input-button"
          onClick={handleSend}
          disabled={!isConnected || !command.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
};

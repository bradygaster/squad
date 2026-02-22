/**
 * RosterManager component
 * Interface for adding and removing agents from the roster
 */

import React, { useState } from 'react';
import { useAgents } from '../hooks/useAgents';
import { useIPC } from '../hooks/useIPC';
import { IPC_CHANNELS } from '../../shared/ipc-types';
import { AgentAddArgs, AgentRemoveArgs } from '../../shared/ipc-types';

const ROLE_EMOJIS = [
  { emoji: '🏗️', label: 'Architect' },
  { emoji: '⚛️', label: 'Frontend' },
  { emoji: '🔧', label: 'Backend' },
  { emoji: '🧪', label: 'Testing' },
  { emoji: '⚙️', label: 'DevOps' },
  { emoji: '📝', label: 'Documentation' },
  { emoji: '📊', label: 'Data' },
  { emoji: '🔒', label: 'Security' },
  { emoji: '👤', label: 'Generic' },
];

interface RosterManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RosterManager: React.FC<RosterManagerProps> = ({
  isOpen,
  onClose,
}) => {
  const agents = useAgents();
  const { invoke, isAvailable } = useIPC();

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [emoji, setEmoji] = useState('👤');
  const [error, setError] = useState('');

  const handleAdd = async () => {
    setError('');

    // Validation
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!role.trim()) {
      setError('Role is required');
      return;
    }

    // Check for duplicate name
    const nameExists = agents.some(
      (agent) => agent.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (nameExists) {
      setError('Agent with this name already exists');
      return;
    }

    if (!isAvailable) {
      setError('CLI not connected');
      return;
    }

    try {
      const args: AgentAddArgs = {
        name: name.trim(),
        role: role.trim(),
        emoji,
      };
      await invoke(IPC_CHANNELS.AGENT_ADD, args);

      // Clear form on success
      setName('');
      setRole('');
      setEmoji('👤');
      setError('');
    } catch (err) {
      setError('Failed to add agent');
      console.error('Failed to add agent:', err);
    }
  };

  const handleRemove = async (agentId: string) => {
    if (!isAvailable) {
      return;
    }

    try {
      const args: AgentRemoveArgs = { agentId };
      await invoke(IPC_CHANNELS.AGENT_REMOVE, args);
    } catch (err) {
      console.error('Failed to remove agent:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="roster-manager-overlay" onClick={onClose}>
      <div
        className="roster-manager-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="roster-manager-header">
          <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>
            Roster Manager
          </h2>
          <button className="roster-manager-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="roster-manager-content">
          {/* Add Agent Section */}
          <section className="roster-manager-section">
            <h3 style={{ fontSize: 'var(--font-size-md)', marginTop: 0 }}>
              Add Agent
            </h3>

            <div className="roster-manager-form">
              <div className="roster-manager-field">
                <label htmlFor="agent-name">Name</label>
                <input
                  id="agent-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Cobb"
                  disabled={!isAvailable}
                />
              </div>

              <div className="roster-manager-field">
                <label htmlFor="agent-role">Role</label>
                <input
                  id="agent-role"
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g., Lead / Architect"
                  disabled={!isAvailable}
                />
              </div>

              <div className="roster-manager-field">
                <label htmlFor="agent-emoji">Emoji</label>
                <select
                  id="agent-emoji"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  disabled={!isAvailable}
                  className="roster-manager-emoji-select"
                >
                  {ROLE_EMOJIS.map((item) => (
                    <option key={item.emoji} value={item.emoji}>
                      {item.emoji} {item.label}
                    </option>
                  ))}
                </select>
              </div>

              {error && <div className="roster-manager-error">{error}</div>}

              <button
                className="roster-manager-button-add"
                onClick={handleAdd}
                disabled={!isAvailable}
              >
                Add Agent
              </button>
            </div>
          </section>

          {/* Current Agents Section */}
          <section className="roster-manager-section">
            <h3 style={{ fontSize: 'var(--font-size-md)' }}>
              Current Agents ({agents.length})
            </h3>

            {agents.length === 0 ? (
              <div
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                  padding: 'var(--spacing-md) 0',
                }}
              >
                No agents yet
              </div>
            ) : (
              <div className="roster-manager-agent-list">
                {agents.map((agent) => (
                  <div key={agent.id} className="roster-manager-agent-item">
                    <div className="roster-manager-agent-info">
                      <div className="roster-manager-agent-name">
                        {agent.emoji} {agent.name}
                      </div>
                      <div className="roster-manager-agent-role">
                        {agent.role}
                      </div>
                    </div>
                    <button
                      className="roster-manager-button-remove"
                      onClick={() => handleRemove(agent.id)}
                      disabled={!isAvailable}
                      title="Remove agent"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

/**
 * AgentCard component
 * Displays individual agent status, task, and output
 */

import React, { useEffect, useRef } from 'react';
import { Agent, AgentStatus } from '../../shared/models';

interface AgentCardProps {
  agent: Agent;
}

const getStatusClass = (status: AgentStatus): string => {
  switch (status) {
    case AgentStatus.Idle:
      return 'status-idle';
    case AgentStatus.Busy:
      return 'status-busy';
    case AgentStatus.Blocked:
      return 'status-blocked';
    case AgentStatus.Offline:
      return 'status-offline';
    default:
      return 'status-idle';
  }
};

export const AgentCard: React.FC<AgentCardProps> = ({ agent }) => {
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when output updates
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [agent.output]);

  return (
    <div className="agent-card">
      <div className="agent-card-header">
        <div>
          <div className="agent-card-name">
            {agent.emoji} {agent.name}
          </div>
        </div>
        <span className={`agent-card-status ${getStatusClass(agent.status)}`}>
          {agent.status}
        </span>
      </div>

      <div className="agent-card-role">{agent.role}</div>

      {agent.currentTask && (
        <div className="agent-card-task">
          Current: {agent.currentTask}
        </div>
      )}

      <div className="agent-card-output" ref={outputRef}>
        {agent.output.length > 0 ? (
          agent.output.slice(-20).join('\n')
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>No output yet...</span>
        )}
      </div>
    </div>
  );
};

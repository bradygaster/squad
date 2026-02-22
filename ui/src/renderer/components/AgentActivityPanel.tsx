/**
 * AgentActivityPanel component
 * Vertical list of agents for the left sidebar
 */

import React from 'react';
import { useAgents } from '../hooks/useAgents';
import { AgentCard } from './AgentCard';

export const AgentActivityPanel: React.FC = () => {
  const agents = useAgents();

  return (
    <section className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--spacing-sm)',
        paddingBottom: 'var(--spacing-sm)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>
          Agents
        </h2>
        <span style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
          fontWeight: 600,
        }}>
          {agents.length}
        </span>
      </div>

      {agents.length === 0 ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          color: 'var(--text-secondary)',
          fontSize: 'var(--font-size-sm)',
        }}>
          No agents
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-sm)',
          overflow: 'auto',
          flex: 1,
        }}>
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </section>
  );
};

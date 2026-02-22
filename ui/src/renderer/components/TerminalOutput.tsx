/**
 * TerminalOutput component
 * Shows a scrolling log of all agent output and system events
 */

import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/store';

export const TerminalOutput: React.FC = () => {
  const { terminalLines } = useStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLines]);

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
          ⬛ Terminal
        </h2>
        <span style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
        }}>
          {terminalLines.length} lines
        </span>
      </div>

      <div className="terminal-output-scroll">
        {terminalLines.length === 0 ? (
          <div style={{
            color: 'var(--text-secondary)',
            padding: 'var(--spacing-lg)',
            textAlign: 'center',
          }}>
            Waiting for activity...
          </div>
        ) : (
          terminalLines.map((line, i) => (
            <div key={i} className="terminal-line">
              <span className="terminal-timestamp">
                {new Date(line.timestamp).toLocaleTimeString()}
              </span>
              {line.agentName && (
                <span className="terminal-agent">[{line.agentName}]</span>
              )}
              <span className="terminal-text">{line.text}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
};

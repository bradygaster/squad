import React, { useState } from 'react';
import { AgentActivityPanel } from './components/AgentActivityPanel';
import { TerminalOutput } from './components/TerminalOutput';
import { CommandQueue } from './components/CommandQueue';
import { CommandInput } from './components/CommandInput';
import { RosterManager } from './components/RosterManager';
import { useTerminal } from './hooks/useTerminal';

function App() {
  const [isRosterOpen, setIsRosterOpen] = useState(false);

  // Single terminal subscription — must be here (once) to avoid duplicates
  useTerminal();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <header style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '2px solid var(--accent)',
        padding: 'var(--spacing-sm) var(--spacing-lg)',
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
          <h1 style={{
            margin: 0,
            fontSize: 'var(--font-size-lg)',
            fontWeight: 700,
            color: 'var(--accent)',
          }}>
            Squad Desktop
          </h1>
          <span style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
          }}>
            AI Agent Monitoring & Control
          </span>
        </div>
        <button
          className="roster-toggle-button"
          onClick={() => setIsRosterOpen(!isRosterOpen)}
          title="Roster Manager"
          style={{ padding: 'var(--spacing-xs) var(--spacing-sm)', fontSize: 'var(--font-size-sm)' }}
        >
          ☰ Roster
        </button>
      </header>

      {/* Main 3-Column Layout */}
      <main style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
        padding: 'var(--spacing-sm)',
        gap: 'var(--spacing-sm)',
      }}>
        {/* Left: Agents */}
        <div style={{
          width: '240px',
          flexShrink: 0,
          overflow: 'auto',
          padding: 'var(--spacing-sm)',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}>
          <AgentActivityPanel />
        </div>

        {/* Center: Terminal Output */}
        <div style={{
          flex: 1,
          overflow: 'hidden',
          padding: 'var(--spacing-sm)',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <TerminalOutput />
        </div>

        {/* Right: Command Queue */}
        <div style={{
          width: '320px',
          flexShrink: 0,
          overflow: 'auto',
          padding: 'var(--spacing-sm)',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
        }}>
          <CommandQueue />
        </div>
      </main>

      {/* Command Input Bar (bottom) */}
      <footer style={{
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        padding: 'var(--spacing-sm) var(--spacing-md)',
        flexShrink: 0,
      }}>
        <CommandInput />
      </footer>

      {/* Roster Manager (overlay modal) */}
      <RosterManager isOpen={isRosterOpen} onClose={() => setIsRosterOpen(false)} />
    </div>
  );
}

export default App;

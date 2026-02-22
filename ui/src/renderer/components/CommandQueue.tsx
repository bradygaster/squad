/**
 * CommandQueue component
 * Displays the list of queued commands with their statuses
 */

import React from 'react';
import { useCommandQueue } from '../hooks/useCommandQueue';
import { QueueItem } from './QueueItem';

export const CommandQueue: React.FC = () => {
  const { queue } = useCommandQueue();

  return (
    <section className="panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--spacing-md)',
          paddingBottom: 'var(--spacing-sm)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>
          Command Queue
        </h2>
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-secondary)',
            fontWeight: 600,
          }}
        >
          {queue.length} {queue.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {queue.length === 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '200px',
            color: 'var(--text-secondary)',
            fontSize: 'var(--font-size-md)',
          }}
        >
          No commands in queue
        </div>
      ) : (
        <div className="queue-list">
          {queue.map((item, index) => (
            <QueueItem
              key={item.id}
              item={item}
              position={index}
              totalCount={queue.length}
            />
          ))}
        </div>
      )}
    </section>
  );
};

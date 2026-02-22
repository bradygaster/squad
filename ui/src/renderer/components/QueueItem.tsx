/**
 * QueueItem component
 * Displays a single command in the queue with status and actions
 */

import React from 'react';
import { QueueItem as QueueItemModel, QueueStatus } from '../../shared/models';
import { useCommandQueue } from '../hooks/useCommandQueue';
import { useAgents } from '../hooks/useAgents';

interface QueueItemProps {
  item: QueueItemModel;
  position: number;
  totalCount: number;
}

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
};

const getStatusClass = (status: QueueStatus): string => {
  switch (status) {
    case QueueStatus.Pending:
      return 'queue-status-pending';
    case QueueStatus.Running:
      return 'queue-status-running';
    case QueueStatus.Done:
      return 'queue-status-done';
    case QueueStatus.Cancelled:
      return 'queue-status-cancelled';
    default:
      return 'queue-status-pending';
  }
};

export const QueueItem: React.FC<QueueItemProps> = ({
  item,
  position,
  totalCount,
}) => {
  const { reorderCommand, cancelCommand } = useCommandQueue();
  const agents = useAgents();

  const targetAgent = item.command.targetAgentId
    ? agents.find((a) => a.id === item.command.targetAgentId)
    : null;

  const assignedAgent = item.assignedAgentId
    ? agents.find((a) => a.id === item.assignedAgentId)
    : null;

  const handleMoveUp = () => {
    if (position > 0) {
      reorderCommand(item.id, position - 1);
    }
  };

  const handleMoveDown = () => {
    if (position < totalCount - 1) {
      reorderCommand(item.id, position + 1);
    }
  };

  const handleCancel = () => {
    cancelCommand(item.id);
  };

  const isPending = item.status === QueueStatus.Pending;
  const isRunning = item.status === QueueStatus.Running;
  const isDone = item.status === QueueStatus.Done;

  return (
    <div className={`queue-item ${isDone ? 'queue-item-done' : ''}`}>
      <div className="queue-item-header">
        <span className={`queue-item-status ${getStatusClass(item.status)}`}>
          {item.status}
        </span>
        <span className="queue-item-timestamp">
          {formatTimestamp(item.command.createdAt)}
        </span>
      </div>

      <div className="queue-item-command">{item.command.text}</div>

      <div className="queue-item-meta">
        {targetAgent ? (
          <span className="queue-item-target">
            → {targetAgent.emoji} {targetAgent.name}
          </span>
        ) : (
          <span className="queue-item-target">→ All Agents</span>
        )}

        {isRunning && assignedAgent && (
          <span className="queue-item-assigned">
            Running on {assignedAgent.emoji} {assignedAgent.name}
          </span>
        )}
      </div>

      {isDone && item.result && (
        <div className="queue-item-result">{item.result}</div>
      )}

      {isPending && (
        <div className="queue-item-actions">
          <button
            className="queue-item-button queue-item-button-small"
            onClick={handleMoveUp}
            disabled={position === 0}
            title="Move up"
          >
            ↑
          </button>
          <button
            className="queue-item-button queue-item-button-small"
            onClick={handleMoveDown}
            disabled={position >= totalCount - 1}
            title="Move down"
          >
            ↓
          </button>
          <button
            className="queue-item-button queue-item-button-danger"
            onClick={handleCancel}
            title="Cancel"
          >
            ✕
          </button>
        </div>
      )}

      {isRunning && (
        <div className="queue-item-spinner">
          <span className="spinner-icon">⟳</span> Processing...
        </div>
      )}
    </div>
  );
};

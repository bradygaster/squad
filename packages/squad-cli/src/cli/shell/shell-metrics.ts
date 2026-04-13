// Re-export from SDK — shell/shell-metrics.ts is now a migration shim
export {
  isShellTelemetryEnabled,
  enableShellMetrics,
  recordShellSessionDuration,
  recordAgentResponseLatency,
  recordShellError,
  _resetShellMetrics,
} from '@bradygaster/squad-sdk/runtime/shell-metrics';

/**
 * Webhook alerts capability — POST to a webhook URL on consecutive failures.
 *
 * Ported from ralph-watch.ps1 Teams alert logic in `Invoke-PostFailureRemediation`.
 * Org-agnostic: works with any webhook that accepts JSON POST (Slack, Discord,
 * Teams Incoming Webhook, generic HTTP endpoint).
 *
 * Runs in the `housekeeping` phase.
 *
 * Config (via squad.config.ts → watch.capabilities["webhook-alerts"]):
 *   webhookUrl       – URL to POST to (also settable via --webhook-url flag)
 *   alertThreshold   – consecutive failures before alerting (default: 3, also --alert-threshold)
 *   includeHostname  – include machine hostname in payload (default: true)
 *
 * CLI flags:
 *   --webhook-url <url>       Override webhook URL
 *   --alert-threshold <n>     Override failure threshold
 */

import * as os from 'node:os';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';
import { getConsecutiveFailures } from './heartbeat.js';

export class WebhookAlertCapability implements WatchCapability {
  readonly name = 'webhook-alerts';
  readonly description = 'POST to webhook on consecutive failures above threshold';
  readonly configShape = 'object' as const;
  readonly requires = [];
  readonly phase = 'housekeeping' as const;

  async preflight(context: WatchContext): Promise<PreflightResult> {
    const config = context.config as Record<string, unknown>;
    const url = config['webhookUrl'] as string | undefined;
    if (!url) {
      return { ok: false, reason: 'No webhookUrl configured (use --webhook-url or config)' };
    }
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    const config = context.config as Record<string, unknown>;
    const webhookUrl = config['webhookUrl'] as string;
    const threshold = (config['alertThreshold'] as number) ?? 3;
    const includeHostname = (config['includeHostname'] as boolean) ?? true;
    const failures = getConsecutiveFailures();

    if (failures < threshold) {
      return {
        success: true,
        summary: `${failures} failure(s) — below threshold (${threshold})`,
      };
    }

    // Build generic JSON payload (works with Slack, Discord, Teams, etc.)
    const hostname = includeHostname ? os.hostname() : 'unknown';
    const payload = {
      text: `🚨 Squad Watch Alert: ${failures} consecutive failures on ${hostname} (round ${context.round})`,
      // Slack-compatible fields
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🚨 Squad Watch Alert*\n${failures} consecutive failures`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Machine:* ${hostname}` },
            { type: 'mrkdwn', text: `*Round:* ${context.round}` },
            { type: 'mrkdwn', text: `*Failures:* ${failures}` },
            { type: 'mrkdwn', text: `*Timestamp:* ${new Date().toISOString()}` },
          ],
        },
      ],
      // Teams-compatible fields (MessageCard format)
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: `Squad Watch: ${failures} consecutive failures on ${hostname}`,
      themeColor: 'FF0000',
      title: `🚨 Squad Watch Alert — ${hostname}`,
      sections: [
        {
          activityTitle: `${failures} consecutive failures detected`,
          facts: [
            { name: 'Machine', value: hostname },
            { name: 'Round', value: String(context.round) },
            { name: 'Consecutive Failures', value: String(failures) },
            { name: 'Timestamp', value: new Date().toISOString() },
          ],
        },
      ],
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return {
          success: false,
          summary: `Webhook POST failed: ${response.status} ${response.statusText}`,
        };
      }

      return {
        success: true,
        summary: `Alert sent (${failures} failures, threshold ${threshold})`,
      };
    } catch (e) {
      return {
        success: false,
        summary: `Webhook error: ${(e as Error).message}`,
      };
    }
  }
}

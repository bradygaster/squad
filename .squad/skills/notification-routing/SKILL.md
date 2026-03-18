---
name: notification-routing
description: Route agent notifications to specific channels by type instead of flooding a single channel
domain: communication, observability, multi-agent
confidence: high
source: earned (notification firehose incident — 2026-03, tamirdresher/tamresearch1)
---

## Context

When a Squad grows beyond a few agents, notifications flood a single channel — failure alerts drown in daily
briefings, tech news buries security findings, and everything gets ignored. This is the microservices equivalent
of dumping every service's logs into one file.

The fix is **pub-sub with topic routing**: agents tag notifications with a channel type, and a routing function
sends them to the appropriate destination.

**Trigger symptoms:**
- Important alerts missed because they're buried in routine notifications
- Team members turning off notifications entirely (signal overwhelm)
- Onboarding friction: "where do I look for X?"

## Patterns

### Channel Config File

Define a `teams-channels.json` config (or equivalent) mapping notification types to channel names:

```json
{
  "channels": {
    "notifications": "squad-alerts",
    "tech-news": "tech-news",
    "security": "security-findings",
    "releases": "release-announcements",
    "daily-digest": "daily-digest"
  }
}
```

Place this in `.squad/teams-channels.json` (git-tracked, shared across the team).

### Routing in PowerShell

```powershell
function Send-TeamNotification {
    param(
        [string]$Message,
        [string]$Channel = "notifications",   # default channel
        [string]$Urgency = "normal"           # normal | high | low
    )

    $config = Get-Content ".squad\teams-channels.json" | ConvertFrom-Json
    $targetChannel = $config.channels.$Channel ?? $config.channels.notifications

    # Format by urgency
    $prefix = switch ($Urgency) {
        "high"  { "🚨" }
        "low"   { "ℹ️" }
        default { "📢" }
    }

    Send-TeamsMessage -Channel $targetChannel -Text "$prefix $Message"
}

# Usage:
Send-TeamNotification -Message "37 consecutive failures" -Channel "notifications" -Urgency "high"
Send-TeamNotification -Message "Today's tech digest: ..." -Channel "tech-news" -Urgency "low"
```

### Channel Tag Convention

Agents can tag their output with `CHANNEL:` metadata for the notification dispatcher to read:

```
CHANNEL:security
Worf found 3 new CVEs in dependency scan: lodash@4.17.15, ...
```

The dispatcher reads the tag and routes accordingly:

```powershell
function Dispatch-Notification {
    param([string]$RawOutput)
    
    if ($RawOutput -match '^CHANNEL:(\w[\w-]*)') {
        $channel = $matches[1]
        $message = $RawOutput -replace '^CHANNEL:\w[\w-]*\r?\n', ''
        Send-TeamNotification -Message $message -Channel $channel
    } else {
        Send-TeamNotification -Message $RawOutput   # default channel
    }
}
```

### Service Discovery: Avoid Name Collisions

When creating Teams channels, verify you're in the **correct team** before sending. Teams channel names look
similar across teams (e.g., "Squad" vs "squads" vs "my-squad"). Always resolve the channel ID, not just the
name:

```powershell
# Bad: relies on name uniqueness
Send-TeamsMessage -TeamName "Squad" -ChannelName "notifications" -Text $msg   # ❌ Wrong "Squad"?

# Good: resolve ID once, cache it
$channelId = Get-TeamsChannelId -TeamId $config.teamId -ChannelName $config.channels.notifications
Send-TeamsMessageById -ChannelId $channelId -Text $msg   # ✅ Unambiguous
```

Store resolved channel IDs in `.squad/teams-channels.json` alongside names:

```json
{
  "teamId": "abc-123-def",
  "channels": {
    "notifications": { "name": "squad-alerts", "id": "19:channel-id@thread.tacv2" },
    "tech-news":     { "name": "tech-news",    "id": "19:channel-id-2@thread.tacv2" }
  }
}
```

## Anti-Patterns

**NEVER send all notification types to one channel:**
```powershell
# ❌ All noise, no signal — eventually everyone ignores everything
Send-TeamsMessage -Channel "general" -Text $anything
```

**NEVER use team/channel display names as identifiers:**
```powershell
# ❌ "Squad" and "squads" are different teams — name collisions happen
$team = Find-TeamsTeam -Name "Squad"   # Which "Squad"?
```

## Distributed Systems Pattern

This is **pub-sub with topic routing** — the same principle as Kafka topics, RabbitMQ routing keys, and AWS
SNS topic filtering. The lesson: a single message queue for everything is a recipe for missed alerts. Route by
type. Each consumer subscribes to the topics it cares about.

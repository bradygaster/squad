# Squad Automation Profile v0.1

**Status:** Working Draft

**Document class:** Non-normative requirements draft

**Profile identifier:** `squad-automation/v0.1`

**Maturity:** Requirements draft; non-claimable

**Claimable capabilities:** None

**Implementation status:** Local and GitHub scheduling implementations exist,
but there is no portable execution manifest.

**Known deviations:** Time-zone behavior, retry evidence, generated-provider
drift, and result records differ by provider.

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`,
`squad-coordination-handoff/v0.1`

**Artifact:** `schedule.json`

## 1. Scope and non-goals

This profile defines schedule entries, triggers, execution claims, retries,
results, and provider generation boundaries. It does not standardize cron
engines, host-local time policy, workflow syntax, scripts, prompt content, or
provider deployment mechanisms.

## 2. Manifest model

A manifest declares version and schedules. Each schedule declares ID, name,
enabled state, trigger, task reference, provider set, retry policy, and optional
concurrency key. Trigger types are `cron`, `interval`, `event`, and `startup`.
Task classes are `workflow`, `script`, `agent`, and `webhook`; bindings map
class names to implementation operations.

Task references are inert data. Consumers must not execute a task until
authorization and provider policy checks succeed.

## 3. Execution states

`eligible -> claimed -> running -> succeeded|failed|cancelled|timed-out`

Retry creates a new attempt under the same run ID. Attempt count, backoff, start,
finish, output reference, error class, and next due time are recorded.
Run and attempt records use the shared evidence envelope.

## 4. Trigger and time semantics

Cron bindings must declare time zone and daylight-saving behavior. Interval
triggers use elapsed duration, not calendar arithmetic. Event triggers require
a stable event ID. Startup triggers are idempotent per executor startup ID.

## 5. Candidate operations and roles

Candidate operations are `automation.consume`, `automation.evaluate`,
`automation.claim`, `automation.execute`, and `automation.generate-provider`.
Evaluators decide eligibility; executors claim and run; generators emit
provider-native configuration but do not become manifest authority.

## 6. Failure, retry, and concurrency

Invalid triggers, unknown providers, denied tasks, claim conflict, timeout,
spawn failure, nonzero result, generation drift, and exhausted retries are
distinct failures. Claims use compare-and-swap. A run key deduplicates retries
and multi-provider delivery. Provider generation must be reproducible from the
same manifest and generator version.

## 7. Versioning and extensions

Manifest, provider binding, and generated workflow versions are independent.
Unknown namespaced fields round-trip. Unsupported task or trigger types fail
closed.

## 8. Security and privacy

Script and webhook execution cross a trust boundary and require explicit
authorization. Arguments must remain vectors rather than shell-concatenated
strings. Logs and results must redact secrets and should store large output by
reference.

## 9. Promotion criteria

Publish a manifest covering every trigger, time-zone declaration, duplicate
event, startup deduplication, claim race, retry and backoff, timeout, provider
generation drift, denied execution, and secret-safe diagnostics.

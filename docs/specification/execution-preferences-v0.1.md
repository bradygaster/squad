# Squad Execution Preferences Profile v0.1

<!-- cspell:ignore xhigh -->

**Status:** Working Draft

**Document class:** Normative unless marked informative

**Profile identifier:** `squad-execution-preferences/v0.1`

**Maturity:** Experimental normative

**Depends on:** `squad-core/v0.1`, `squad-interop/v0.1`, `squad-charter/v0.1`,
`squad-configuration-casting/v0.1`

## 1. Scope and non-goals

This profile expresses portable execution intent for model selection, reasoning
effort, context tier, automatic selection, and fallback constraints. It does
not standardize vendor catalogs, prices, quality rankings, entitlement,
authorization, or an implementation's selection algorithm.

## 2. Data model

An execution preference has `model`, `modelClass`, `reasoningEffort`,
`contextTier`, `fallback`, and `source`. Each value is either absent, `auto`,
or an authored identifier from the applicable vocabulary. Absence means no
preference. `auto` asks the executor to select and MUST NOT be sent to a
provider as a literal model or tier.

Portable reasoning intent is `low`, `medium`, `high`, `xhigh`, or `max`.
Portable context intent is `default` or `long_context`. Executors MAY support a
subset but MUST make unsupported values observable.

## 3. Precedence

The order is explicit operation input, session directive, repository
configuration, charter preference, task-aware automatic policy, then platform
default. A higher layer MAY set `auto`, which delegates selection to lower
runtime policy without erasing the source evidence.

## 4. Resolution result and states

Resolution produces `requested`, `selected`, `source`, `fallbackAttempt`,
`availability`, `authorization`, and `policyDisposition`. States are
`unresolved`, `selected`, `unavailable`, `unauthorized`, `policy-denied`,
`fallback-selected`, and `failed`.

Availability means the runtime can address a model. Authorization means the
actor may use it. Policy disposition means local implementation policy permits
it. These checks are independent and MUST NOT be collapsed into one silent
fallback.

## 5. Runtime fallback behavior

Fallback MAY be `none`, `same-provider`, `same-class`, or `platform-default`.
An executor MUST NOT broaden beyond the authored constraint. Every attempt MUST
be recorded. After the configured attempt limit, execution fails explicitly.
Provider-specific chains and current model names are informative implementation
policy, not part of this profile.

## 6. Capabilities and behavior classes

Capabilities are `preferences.consume`, `preferences.resolve`,
`preferences.explain`, and `preferences.execute`. Canonical executors preserve
source and disposition evidence. Compatible executors MAY map unsupported
reasoning or context values to provider vocabulary only when the mapping is
declared and loss is reported.

## 7. Diagnostics, idempotency, and concurrency

Invalid values, contradictory constraints, unavailable selections, denied
authorization, policy denial, and exhausted fallback are distinct diagnostics.
Resolution is idempotent for the same preference revision, task class, actor,
availability snapshot, and policy revision. A changed snapshot produces a new
resolution ID rather than mutating prior evidence.

## 8. Versioning and extensions

Vendor catalogs are discovered out of band and versioned separately. Unknown
namespaced preference fields round-trip. Unsupported mandatory preference
semantics fail closed.

## 9. Security and privacy

Preferences never grant provider access, tools, data access, or spending
authority. Diagnostics MUST NOT expose credentials, account entitlements, or
private policy text.

## 10. Conformance

Tests MUST cover absence versus `auto`, each precedence layer, unavailable and
unauthorized models, policy denial, constrained fallback, exhausted retries,
and reasoning/context subset mapping.

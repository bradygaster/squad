---
name: TypeScript Patterns
domain: development
triggers: [typescript, types, generics, inference, strict, discriminated, union, narrowing]
roles: [developer, lead]
confidence: high
---
## TypeScript Patterns

Prefer `unknown` over `any` for type-safe narrowing.
Use discriminated unions for state machines and variant types.
Leverage the `satisfies` operator for type validation without widening.
Always enable strict mode in tsconfig.json.
Use type guards (`is` keyword) for runtime narrowing.
Prefer `readonly` arrays and objects where mutation is not needed.

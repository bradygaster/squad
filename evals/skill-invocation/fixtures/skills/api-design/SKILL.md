---
name: API Design
domain: architecture
triggers: [api, rest, endpoint, schema, route, resource, versioning, pagination]
roles: [developer, lead]
confidence: high
---
## API Design Patterns

Use consistent resource naming (plural nouns: /users, /teams).
Version APIs via URL path prefix (/v1/, /v2/).
Return proper HTTP status codes (201 for creation, 404 for not found).
Design for pagination from day one (cursor-based preferred).
Use PATCH for partial updates, PUT for full replacement.
Include hypermedia links for discoverability.

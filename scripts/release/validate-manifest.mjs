#!/usr/bin/env node
/**
 * Validate a verification manifest against scripts/release/manifest.schema.json and check its
 * provenance sidecar. Dependency-free: implements the JSON Schema subset the schema uses
 * (type, const, enum, required, properties, additionalProperties, items, pattern, minimum, $ref
 * into $defs) so the release path does not depend on a transitive validator package.
 *
 *   node scripts/release/validate-manifest.mjs <manifest.json> [--provenance <provenance.json>]
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.join(HERE, 'manifest.schema.json');
const canonicalLfBytes = (file) => Buffer.from(readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'));

function typeOf(v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v; }

export function validate(schema, value, root = schema, at = '$', errors = []) {
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], root);
    if (!target) { errors.push(`${at}: unresolvable $ref ${schema.$ref}`); return errors; }
    return validate(target, value, root, at, errors);
  }
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${at}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) errors.push(`${at}: ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = types.some((t) => t === actual || (t === 'number' && actual === 'integer'));
    if (!ok) { errors.push(`${at}: expected ${types.join('|')}, got ${actual}`); return errors; }
  }
  if (typeOf(value) === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: '${value.slice(0, 60)}' does not match /${schema.pattern}/`);
  if ((typeOf(value) === 'integer' || typeOf(value) === 'number') && schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: ${value} < minimum ${schema.minimum}`);
  if (typeOf(value) === 'object') {
    for (const k of schema.required ?? []) if (!(k in value)) errors.push(`${at}: missing required '${k}'`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties && k in schema.properties) validate(schema.properties[k], v, root, `${at}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${at}: unexpected property '${k}'`);
    }
  }
  if (typeOf(value) === 'array' && schema.items) value.forEach((v, i) => validate(schema.items, v, root, `${at}[${i}]`, errors));
  return errors;
}

export function validateManifestFile(manifestPath, provenancePath) {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  const bytes = readFileSync(manifestPath);
  const manifest = JSON.parse(bytes.toString('utf8'));
  const errors = validate(schema, manifest);
  // Cross-field sums the schema cannot express.
  const c = manifest.closure ?? {};
  if (c.carried + c.notCarried !== c.trackedItems) errors.push(`closure: carried (${c.carried}) + notCarried (${c.notCarried}) != trackedItems (${c.trackedItems})`);
  if (c.contentEvidencePresent + c.presenceOnly !== c.carried) errors.push(`closure: contentEvidencePresent (${c.contentEvidencePresent}) + presenceOnly (${c.presenceOnly}) != carried (${c.carried})`);
  if (Array.isArray(c.items) && c.items.length !== c.trackedItems) errors.push(`closure: items.length (${c.items.length}) != trackedItems (${c.trackedItems})`);
  const t = manifest.tests ?? {};
  if (t.byStatus && Object.values(t.byStatus).reduce((a, b) => a + b, 0) + (t.unlistedTests ?? 0) !== t.numTotalTests) errors.push(`tests: byStatus sum + unlistedTests != numTotalTests`);
  if (provenancePath) {
    const prov = JSON.parse(readFileSync(provenancePath, 'utf8'));
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (prov.manifest?.sha256 !== sha) errors.push(`provenance: manifest sha256 ${prov.manifest?.sha256} != actual ${sha}`);
    if (prov.manifest?.bytes !== statSync(manifestPath).size) errors.push(`provenance: manifest bytes ${prov.manifest?.bytes} != actual ${statSync(manifestPath).size}`);
    if (prov.commit !== manifest.target?.commit) errors.push(`provenance: commit ${prov.commit} != manifest target ${manifest.target?.commit}`);
    if (prov.tree !== manifest.target?.tree) errors.push(`provenance: tree ${prov.tree} != manifest target ${manifest.target?.tree}`);
    if (prov.generatorScriptSha256 !== manifest.generator?.scriptSha256) errors.push('provenance: generator script hash differs from manifest');
    const schemaSha = createHash('sha256').update(canonicalLfBytes(SCHEMA_PATH)).digest('hex');
    if (prov.schema?.sha256 !== schemaSha) errors.push(`provenance: schema sha256 ${prov.schema?.sha256} != shipped schema ${schemaSha}`);
    if (prov.schema?.version !== manifest.schemaVersion) errors.push('provenance: schemaVersion differs from manifest');
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifestPath = process.argv[2];
  const pi = process.argv.indexOf('--provenance');
  const errors = validateManifestFile(path.resolve(manifestPath), pi >= 0 ? path.resolve(process.argv[pi + 1]) : undefined);
  for (const e of errors) console.error(`::error::${e}`);
  console.log(`${errors.length === 0 ? '✅' : '❌'} ${manifestPath}: ${errors.length} schema/sum/provenance error(s)`);
  process.exit(errors.length === 0 ? 0 : 1);
}

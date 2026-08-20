import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import {
  VISUAL_CONTEXT_CARRIER_SCHEMA_ID,
  createVisualContextCarrier,
  decodeVisualContextText,
  encodeVisualContextText,
  verifyVisualContextCarrier,
  visualContextCarrierManifest,
} from '../packages/optimizer/src/index.js';
import * as optimizerPackage from 'enigma-memory/optimizer';
import {
  MCP_TOOL_PROTOCOL_AUDIT_SCHEMA,
  coreToolDescriptors,
  createMcpToolProtocolAudit,
  handleJsonRpcRequest,
  startStdioServer,
  toolDescriptors,
  toolDescriptorsForProfile,
} from '../packages/mcp-server/src/index.js';
import { main } from '../apps/cli/bin/enigma.mjs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PRIVATE_SENTINEL = 'visual carrier private sentinel café λ \\u{literal}';

function captureIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write(value) { stdout += String(value); } },
      stderr: { write(value) { stderr += String(value); } },
    },
    stdout() { return stdout; },
    stderr() { return stderr; },
  };
}

async function callTool(id, name, args = {}) {
  return handleJsonRpcRequest({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
}

async function seededBundle() {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-visual-context-'));
  const bundlePath = join(directory, 'bundle.json');
  const initialized = await callTool('init', 'enigma_init', { bundlePath, subject_id: 'visual-context-test' });
  assert.equal(initialized.result.isError, false);
  const remembered = await callTool('remember', 'enigma_remember', {
    bundlePath,
    text: `A remembered fact for carrier retrieval. ${PRIVATE_SENTINEL}`,
    purpose: 'visual_context_test',
  });
  assert.equal(remembered.result.isError, false);
  return { directory, bundlePath };
}

test('visual context carrier is deterministic, reversible, and explicit about its boundaries', () => {
  const source = `${PRIVATE_SENTINEL}\r\n${'Identifiers alpha_1 beta_2 and exact values 17, 29, 41. '.repeat(35)}`;
  const options = {
    text: source,
    width: 300,
    height: 220,
    line_repeat: 1,
    palette: 'row6',
    max_pages: 8,
    pixels_per_token: 750,
  };
  const first = createVisualContextCarrier(options);
  const second = createVisualContextCarrier(options);
  const firstManifest = visualContextCarrierManifest(first);
  const secondManifest = visualContextCarrierManifest(second);

  assert.equal(first.schema, VISUAL_CONTEXT_CARRIER_SCHEMA_ID);
  assert.deepEqual(firstManifest, secondManifest);
  assert.equal(first.pages.length > 1, true);
  assert.equal(first.pages.length, second.pages.length);
  assert.equal(first.image_token_estimate.explicit_formula_input, true);
  assert.equal(first.claim_boundaries.contains_plaintext_equivalent, true);
  assert.equal(first.claim_boundaries.encryption_claim, false);
  assert.equal(first.claim_boundaries.model_recall_guarantee, false);
  assert.equal(first.claim_boundaries.provider_billing_guarantee, false);
  assert.equal(first.claim_boundaries.public_artifact_safe, false);
  assert.equal(first.claim_boundaries.benchmark_each_model, true);
  assert.equal(decodeVisualContextText(encodeVisualContextText(source)), source);
  assert.equal(decodeVisualContextText(first.encoded_text), source);

  for (let index = 0; index < first.pages.length; index += 1) {
    assert.equal(first.pages[index].png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), true);
    assert.equal(first.pages[index].png.equals(second.pages[index].png), true);
    assert.equal(Object.prototype.propertyIsEnumerable.call(first.pages[index], 'png'), false);
  }
  assert.doesNotMatch(JSON.stringify(firstManifest), /visual carrier private sentinel|café|Identifiers alpha_1/u);
  assert.equal(verifyVisualContextCarrier(first, { source_text: source }).ok, true);
  assert.equal(verifyVisualContextCarrier(first, { source_text: `${source}changed` }).ok, false);
});

test('package optimizer export includes the visual carrier API', () => {
  assert.equal(optimizerPackage.createVisualContextCarrier, createVisualContextCarrier);
  assert.equal(optimizerPackage.visualContextCarrierManifest, visualContextCarrierManifest);
  assert.equal(optimizerPackage.verifyVisualContextCarrier, verifyVisualContextCarrier);
});

test('MCP protocol audit identifies flat tools and existing nested exposure', () => {
  const report = createMcpToolProtocolAudit();
  assert.equal(report.schema, MCP_TOOL_PROTOCOL_AUDIT_SCHEMA);
  assert.equal(report.summary.tool_count, toolDescriptors.length);
  assert.equal(report.summary.reliability_guarantee, false);
  const visual = report.tools.find((tool) => tool.name === 'enigma_visual_context');
  const context = report.tools.find((tool) => tool.name === 'enigma_context_pack');
  const settlement = report.tools.find((tool) => tool.name === 'enigma_settlement_quote');
  assert.equal(visual.flat_primitive, true);
  assert.equal(visual.max_depth, 1);
  assert.equal(visual.array_count, 0);
  assert.equal(visual.nested_object_count, 0);
  assert.equal(context.flat_primitive, false);
  assert.equal(settlement.grade, 'complex');
  assert.ok(report.summary.complex_tool_count > 0);
  assert.match(report.rules.harness_boundary, /client harness/i);
});

test('core MCP profile exposes only flat primitive schemas over JSON-RPC and stdio', async () => {
  const coreAudit = createMcpToolProtocolAudit(toolDescriptorsForProfile('core'));
  assert.equal(coreAudit.summary.tool_count, coreToolDescriptors.length);
  assert.equal(coreAudit.summary.flat_primitive_tool_count, coreToolDescriptors.length);
  assert.equal(coreAudit.summary.moderate_tool_count, 0);
  assert.equal(coreAudit.summary.complex_tool_count, 0);
  assert.equal(coreAudit.tools.every((tool) => tool.max_depth <= 1 && tool.array_count === 0 && tool.nested_object_count === 0), true);

  const listed = await handleJsonRpcRequest(
    { jsonrpc: '2.0', id: 'core-list', method: 'tools/list' },
    { toolProfile: 'core' },
  );
  const names = listed.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, coreToolDescriptors.map((tool) => tool.name));
  assert.equal(names.includes('enigma_visual_context'), true);
  assert.equal(names.includes('enigma_settlement_quote'), false);
  const hiddenCall = await handleJsonRpcRequest({
    jsonrpc: '2.0',
    id: 'hidden-call',
    method: 'tools/call',
    params: { name: 'enigma_settlement_quote', arguments: {} },
  }, { toolProfile: 'core' });
  assert.equal(hiddenCall.error.code, -32602);

  const input = new PassThrough();
  const output = new PassThrough();
  let stdout = '';
  output.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  const server = startStdioServer({ input, output, errorOutput: { write() {} }, toolProfile: 'core' });
  input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 'stdio-core-list', method: 'tools/list' })}\n`);
  await server.done;
  const stdioList = JSON.parse(stdout.trim());
  assert.deepEqual(stdioList.result.tools.map((tool) => tool.name), names);
});

test('MCP visual context tool returns image content with a plaintext-free structured manifest', async () => {
  const { bundlePath } = await seededBundle();
  const listed = await handleJsonRpcRequest({ jsonrpc: '2.0', id: 'list', method: 'tools/list' });
  const descriptor = listed.result.tools.find((tool) => tool.name === 'enigma_visual_context');
  assert.ok(descriptor);
  assert.deepEqual(Object.values(descriptor.inputSchema.properties).map((property) => property.type).filter(Boolean).every((type) => ['string', 'integer', 'number', 'boolean'].includes(type)), true);

  const response = await callTool('visual', 'enigma_visual_context', {
    bundlePath,
    query: 'carrier retrieval',
    purpose: 'mcp_visual_test',
    limit: 1,
    width: 300,
    height: 220,
    line_repeat: 1,
    palette: 'bw',
    max_pages: 4,
    pixels_per_token: 750,
  });
  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.schema, VISUAL_CONTEXT_CARRIER_SCHEMA_ID);
  assert.equal(response.result.structuredContent.claim_boundaries.contains_plaintext_equivalent, true);
  assert.equal(response.result.content[0].type, 'text');
  assert.equal(response.result.content.slice(1).every((entry) => entry.type === 'image' && entry.mimeType === 'image/png'), true);
  assert.equal(Buffer.from(response.result.content[1].data, 'base64').subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), true);
  assert.doesNotMatch(JSON.stringify(response.result.structuredContent), /visual carrier private sentinel|café/u);
});

test('CLI writes image carrier pages and exposes the MCP protocol audit', async () => {
  const { directory, bundlePath } = await seededBundle();
  const outputDirectory = join(directory, 'visual-pages');
  const contextCapture = captureIo();
  const exitCode = await main([
    'context',
    '--bundle', bundlePath,
    '--query', 'carrier retrieval',
    '--purpose', 'cli_visual_test',
    '--limit', '1',
    '--carrier', 'image',
    '--out-dir', outputDirectory,
    '--image-width', '300',
    '--image-height', '220',
    '--line-repeat', '1',
    '--palette', 'row6',
    '--max-pages', '4',
    '--pixels-per-token', '750',
  ], contextCapture.io);
  assert.equal(exitCode, 0, contextCapture.stderr());
  const result = JSON.parse(contextCapture.stdout());
  assert.equal(result.schema, 'enigma.visual_context_carrier_artifacts.v1');
  assert.equal(result.claim_boundaries.contains_plaintext_equivalent, true);
  assert.equal(result.claim_boundaries.public_artifact_safe, false);
  assert.doesNotMatch(contextCapture.stdout(), /visual carrier private sentinel|café/u);

  const files = await readdir(outputDirectory);
  assert.ok(files.includes('manifest.json'));
  const pageFile = files.find((file) => /^page-\d{4}\.png$/u.test(file));
  assert.ok(pageFile);
  const png = await readFile(join(outputDirectory, pageFile));
  assert.equal(png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), true);
  const manifest = JSON.parse(await readFile(join(outputDirectory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.schema, VISUAL_CONTEXT_CARRIER_SCHEMA_ID);
  assert.doesNotMatch(JSON.stringify(manifest), /visual carrier private sentinel|café/u);

  const auditCapture = captureIo();
  const auditExit = await main(['mcp', 'audit'], auditCapture.io);
  assert.equal(auditExit, 0, auditCapture.stderr());
  const audit = JSON.parse(auditCapture.stdout());
  assert.equal(audit.schema, MCP_TOOL_PROTOCOL_AUDIT_SCHEMA);
  assert.ok(audit.tools.some((tool) => tool.name === 'enigma_visual_context' && tool.flat_primitive));
  assert.equal(audit.selected_profile, 'core');
  assert.equal(audit.summary.flat_primitive_tool_count, audit.summary.tool_count);
  assert.equal(audit.summary.complex_tool_count, 0);
});

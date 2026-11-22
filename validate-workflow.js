/**
 * Workflow Schema & Connection Graph Validator
 * Verifies n8n workflow JSON structure, node uniqueness, and edge integrity.
 */

const fs = require('node:fs');
const path = require('path');
const assert = require('node:assert');

function validateWorkflowFile(filePath) {
  console.log(`--- Validating Workflow Graph: ${path.basename(filePath)} ---`);
  const raw = fs.readFileSync(filePath, 'utf8');
  const workflow = JSON.parse(raw);

  assert(workflow.name && typeof workflow.name === 'string', 'Workflow must have a non-empty name');
  assert(Array.isArray(workflow.nodes) && workflow.nodes.length > 0, 'Workflow must contain an array of nodes');
  assert(workflow.connections && typeof workflow.connections === 'object', 'Workflow must contain connections');

  const nodeMap = new Map();
  workflow.nodes.forEach((node, index) => {
    assert(node.id, `Node at index ${index} missing required 'id'`);
    assert(node.name, `Node at index ${index} missing required 'name'`);
    assert(node.type, `Node '${node.name}' missing required 'type'`);
    assert(!nodeMap.has(node.id), `Duplicate node ID detected: ${node.id}`);
    assert(![...nodeMap.values()].some(n => n.name === node.name), `Duplicate node name detected: ${node.name}`);
    nodeMap.set(node.id, node);
  });

  console.log(`✓ Validated ${workflow.nodes.length} unique nodes.`);

  // Validate connections
  let totalConnections = 0;
  for (const [sourceName, outputs] of Object.entries(workflow.connections)) {
    const sourceNode = [...nodeMap.values()].find(n => n.name === sourceName);
    assert(sourceNode, `Connection source node '${sourceName}' does not exist in nodes list`);

    if (outputs.main) {
      outputs.main.forEach((branch, branchIndex) => {
        branch.forEach(conn => {
          const targetNode = [...nodeMap.values()].find(n => n.name === conn.node);
          assert(targetNode, `Connection from '${sourceName}' points to non-existent node '${conn.node}'`);
          totalConnections++;
        });
      });
    }
  }

  console.log(`✓ Validated ${totalConnections} connection graph edges.`);
  console.log('✓ Workflow Graph Integrity & Schema Check Passed Successfully.\n');
  return true;
}

if (require.main === module) {
  const target = path.join(__dirname, 'workflow', 'invoice-audit-workflow.json');
  validateWorkflowFile(target);
}

module.exports = { validateWorkflowFile };

import { defineWorkflow, joinSession } from '@github/copilot-sdk/extension';
import { specialistAgent, workflowDefinition } from './workflow.mjs';

await joinSession({
  customAgents: [specialistAgent],
  workflows: [defineWorkflow(workflowDefinition)],
});

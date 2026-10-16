import type { ThinkingOrbState } from '@/app/_components/ui/thinking-orb';
import type { TranslationKey } from '@/app/_i18n/en';

import { readToolName } from './tool-name';

/**
 * A tool call as a step a person can follow: what the agent is doing, and to
 * what. `mcp__trino__list_tables {catalog, schema}` reads "Listing tables:
 * iceberg.public", the way a checklist names its items, instead of the wire
 * name with the underscores taken out.
 *
 * The label is translated; the detail is not. A table, a path, a query or a
 * skill name is a technical identifier, and the i18n rule keeps those as the
 * agent said them. The wire name still goes on the element's `title`.
 */
export type ToolLabelKey = Extract<TranslationKey, `chat.tool.${string}`>;

export interface ToolDescription {
  readonly labelKey: ToolLabelKey;
  /** The thing the step acts on, when the arguments say. */
  readonly detail?: string;
  /** Exactly what the agent called it. */
  readonly raw: string;
}

type ToolArguments = Readonly<Record<string, unknown>>;
type DetailReader = (args: ToolArguments) => string | undefined;

/** Longer details are cut so a row stays a row; the full value is in the trace. */
const DETAIL_MAX_LENGTH = 72;

const text =
  (...keys: readonly string[]): DetailReader =>
  (args) => {
    for (const key of keys) {
      const value = args[key];
      if (typeof value === 'string' && value.trim() !== '') return value;
    }
    return undefined;
  };

const tableRef: DetailReader = (args) => {
  const parts = ['catalog', 'schema', 'table']
    .map((key) => args[key])
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '');
  return parts.length === 0 ? undefined : parts.join('.');
};

const none: DetailReader = () => undefined;

/**
 * Keyed by the action, without the `mcp__<server>__` prefix: the servers do
 * not reuse action names, and the built-in tools have none.
 */
const CATALOG: Readonly<Record<string, readonly [ToolLabelKey, DetailReader]>> = {
  // Warehouse (mcp trino)
  list_catalogs: ['chat.tool.listCatalogs', none],
  list_schemas: ['chat.tool.listSchemas', tableRef],
  list_tables: ['chat.tool.listTables', tableRef],
  describe_table: ['chat.tool.describeTable', tableRef],
  profile_table: ['chat.tool.profileTable', tableRef],
  run_query: ['chat.tool.runQuery', text('sql')],
  // Charts (mcp chart)
  preview_chart: ['chat.tool.previewChart', text('title')],
  list_charts: ['chat.tool.listCharts', none],
  get_chart: ['chat.tool.getChart', text('title')],
  create_chart: ['chat.tool.createChart', text('title')],
  update_chart: ['chat.tool.updateChart', text('title')],
  remove_chart: ['chat.tool.removeChart', text('title')],
  // Documents (mcp document)
  list_documents: ['chat.tool.listDocuments', none],
  get_document_text: ['chat.tool.getDocumentText', text('title')],
  create_document: ['chat.tool.createDocument', text('title')],
  // Skills (mcp skill and built-ins)
  list_skills: ['chat.tool.listSkills', none],
  get_skill: ['chat.tool.getSkill', text('name')],
  create_skill: ['chat.tool.createSkill', text('name')],
  update_skill: ['chat.tool.updateSkill', text('name')],
  delete_skill: ['chat.tool.deleteSkill', text('name')],
  InvokeSkill: ['chat.tool.invokeSkill', text('name', 'skill')],
  ProposeSkill: ['chat.tool.proposeSkill', text('name')],
  // Plant model (mcp plant_model)
  list_plant_model_nodes: ['chat.tool.listPlantModelNodes', text('query')],
  get_plant_model_node: ['chat.tool.getPlantModelNode', none],
  traverse_plant_model_routes: ['chat.tool.traversePlantModelRoutes', none],
  resolve_plant_model_catalog_property: ['chat.tool.resolvePlantModelProperty', none],
  // Automations (mcp automation_workflow)
  create_workflow: ['chat.tool.createWorkflow', text('name', 'title')],
  get_workflow: ['chat.tool.getWorkflow', none],
  list_available_agents: ['chat.tool.listAvailableAgents', none],
  add_workflow_step: ['chat.tool.addWorkflowStep', none],
  remove_workflow_step: ['chat.tool.removeWorkflowStep', none],
  update_workflow_step: ['chat.tool.updateWorkflowStep', none],
  update_workflow_trigger: ['chat.tool.updateWorkflowTrigger', none],
  enable_workflow: ['chat.tool.enableWorkflow', none],
  test_fire_workflow: ['chat.tool.testFireWorkflow', none],
  // Workspace and process (built-ins)
  Read: ['chat.tool.readFile', text('file_path', 'path')],
  Write: ['chat.tool.writeFile', text('file_path', 'path')],
  Edit: ['chat.tool.editFile', text('file_path', 'path')],
  Glob: ['chat.tool.findFiles', text('pattern', 'path')],
  Grep: ['chat.tool.searchFiles', text('pattern')],
  AstGrep: ['chat.tool.searchFiles', text('pattern')],
  Bash: ['chat.tool.runCommand', text('command')],
  HttpRequest: ['chat.tool.httpRequest', text('url')],
  // Conversation and orchestration (built-ins)
  AskUser: ['chat.tool.askUser', none],
  ProposePlan: ['chat.tool.proposePlan', none],
  SpawnAgent: ['chat.tool.spawnAgent', none],
  ManageCapabilities: ['chat.tool.manageCapabilities', none],
  SetApplicationState: ['chat.tool.setApplicationState', text('name')],
  publish_message_block: ['chat.tool.publishMessageBlock', text('block_type', 'kind')],
  WriteReport: ['chat.tool.writeReport', text('title')],
  WriteDashboard: ['chat.tool.writeDashboard', text('title')],
};

/** Other names the same tools go by: local aliases and the chart mutation family. */
const ALIASES: Readonly<Record<string, string>> = {
  read_file: 'Read',
  write_file: 'Write',
  edit_file: 'Edit',
  MultiEdit: 'Edit',
  list_files: 'Glob',
  grep: 'Grep',
  run_command: 'Bash',
  invoke_skill: 'InvokeSkill',
  ListSkills: 'list_skills',
  set_chart_data: 'update_chart',
  set_chart_encodings: 'update_chart',
  set_chart_spec: 'update_chart',
  patch_chart: 'update_chart',
  move_chart: 'update_chart',
};

/**
 * The orb a step shows while it runs — the verb of the label, not the tool:
 * reading anything is a search, producing an artefact is composing, changing
 * skills or automations is weaving, changing files is shaping.
 */
const ORB_STATES: Readonly<Partial<Record<ToolLabelKey, ThinkingOrbState>>> = {
  'chat.tool.listCatalogs': 'searching',
  'chat.tool.listSchemas': 'searching',
  'chat.tool.listTables': 'searching',
  'chat.tool.describeTable': 'searching',
  'chat.tool.profileTable': 'searching',
  'chat.tool.runQuery': 'searching',
  'chat.tool.listCharts': 'searching',
  'chat.tool.getChart': 'searching',
  'chat.tool.listDocuments': 'searching',
  'chat.tool.getDocumentText': 'searching',
  'chat.tool.listSkills': 'searching',
  'chat.tool.getSkill': 'searching',
  'chat.tool.listPlantModelNodes': 'searching',
  'chat.tool.getPlantModelNode': 'searching',
  'chat.tool.traversePlantModelRoutes': 'searching',
  'chat.tool.resolvePlantModelProperty': 'searching',
  'chat.tool.getWorkflow': 'searching',
  'chat.tool.listAvailableAgents': 'searching',
  'chat.tool.readFile': 'searching',
  'chat.tool.findFiles': 'searching',
  'chat.tool.searchFiles': 'searching',
  'chat.tool.previewChart': 'composing',
  'chat.tool.createChart': 'composing',
  'chat.tool.updateChart': 'composing',
  'chat.tool.createDocument': 'composing',
  'chat.tool.writeReport': 'composing',
  'chat.tool.writeDashboard': 'composing',
  'chat.tool.publishMessageBlock': 'composing',
  'chat.tool.createSkill': 'weaving',
  'chat.tool.updateSkill': 'weaving',
  'chat.tool.deleteSkill': 'weaving',
  'chat.tool.invokeSkill': 'weaving',
  'chat.tool.proposeSkill': 'weaving',
  'chat.tool.createWorkflow': 'weaving',
  'chat.tool.addWorkflowStep': 'weaving',
  'chat.tool.removeWorkflowStep': 'weaving',
  'chat.tool.updateWorkflowStep': 'weaving',
  'chat.tool.updateWorkflowTrigger': 'weaving',
  'chat.tool.enableWorkflow': 'weaving',
  'chat.tool.testFireWorkflow': 'weaving',
  'chat.tool.writeFile': 'shaping',
  'chat.tool.editFile': 'shaping',
  'chat.tool.removeChart': 'shaping',
  'chat.tool.runCommand': 'shaping',
  'chat.tool.httpRequest': 'connecting',
  'chat.tool.askUser': 'listening',
  'chat.tool.proposePlan': 'listening',
};

export function orbStateFor(labelKey: ToolLabelKey): ThinkingOrbState {
  return ORB_STATES[labelKey] ?? 'working';
}

function shorten(value: string): string {
  const oneLine = value.replace(/\s+/gu, ' ').trim();
  return oneLine.length > DETAIL_MAX_LENGTH ? `${oneLine.slice(0, DETAIL_MAX_LENGTH)}…` : oneLine;
}

export function describeTool(raw: string, args: ToolArguments | undefined): ToolDescription {
  const name = readToolName(raw);
  const action = name.server === null ? raw : raw.slice(raw.lastIndexOf('__') + 2);
  const entry = CATALOG[ALIASES[action] ?? action];
  if (entry === undefined) {
    // Unknown to this build: say that a tool ran and which one, in words.
    return { labelKey: 'chat.tool.generic', detail: name.action, raw };
  }
  const detail = entry[1](args ?? {});
  return detail === undefined
    ? { labelKey: entry[0], raw }
    : { labelKey: entry[0], detail: shorten(detail), raw };
}

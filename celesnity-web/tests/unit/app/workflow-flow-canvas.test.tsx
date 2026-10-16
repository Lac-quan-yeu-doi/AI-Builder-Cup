// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import type { Connection } from '@xyflow/react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    Background: () => null,
    Controls: () => null,
    Handle: ({
      id,
      'aria-label': label,
    }: {
      readonly id: string;
      readonly 'aria-label'?: string;
    }) => <button aria-label={label ?? id} />,
    ReactFlowProvider: ({ children }: { readonly children: ReactNode }) => children,
    ReactFlow: ({
      nodes,
      edges,
      onNodesChange,
      onEdgesChange,
      isValidConnection,
      nodeTypes,
    }: {
      readonly nodes: readonly {
        readonly id: string;
        readonly position: { readonly x: number; readonly y: number };
        readonly deletable?: boolean;
        readonly data: Record<string, unknown>;
      }[];
      readonly edges: readonly { readonly id: string; readonly label?: string }[];
      readonly nodeTypes: {
        readonly workflow: (props: {
          readonly data: Record<string, unknown>;
          readonly selected: boolean;
        }) => ReactNode;
      };
      readonly onNodesChange?: (changes: readonly unknown[]) => void;
      readonly onEdgesChange?: (changes: readonly unknown[]) => void;
      readonly isValidConnection?: (connection: Connection) => boolean;
    }) => (
      <div>
        {nodes.map((node) =>
          createElement(nodeTypes.workflow, { key: node.id, data: node.data, selected: false }),
        )}
        {edges.map((edge) => (
          <span key={edge.id}>{edge.label}</span>
        ))}
        {isValidConnection ? (
          <>
            <output aria-label="Outcome to trigger allowed">
              {String(
                isValidConnection({
                  source: 'outcome',
                  sourceHandle: 'error',
                  target: 'trigger',
                  targetHandle: 'in',
                }),
              )}
            </output>
            <output aria-label="Outcome to pipeline allowed">
              {String(
                isValidConnection({
                  source: 'outcome',
                  sourceHandle: 'success',
                  target: 'pipeline',
                  targetHandle: 'in',
                }),
              )}
            </output>
          </>
        ) : null}
        <output aria-label="Node position">{`${nodes[0].position.x},${nodes[0].position.y}`}</output>
        <button
          onClick={() =>
            onNodesChange?.([
              { id: 'trigger', type: 'position', position: { x: 80, y: 40 }, dragging: true },
            ])
          }
        >
          Drag frame
        </button>
        <button
          onClick={() =>
            onNodesChange?.([
              { id: 'trigger', type: 'position', position: { x: 90, y: 50 }, dragging: false },
            ])
          }
        >
          Drag end
        </button>
        <button
          onClick={() =>
            onNodesChange?.(
              nodes
                .filter((node) => node.deletable)
                .map((node) => ({ id: node.id, type: 'remove' })),
            )
          }
        >
          Delete rendered node
        </button>
        <button
          onClick={() => onEdgesChange?.(edges.map((edge) => ({ id: edge.id, type: 'remove' })))}
        >
          Delete rendered edge
        </button>
      </div>
    ),
  };
});

import { WorkflowFlowCanvas } from '@/app/(workspace)/data-workflows/_components/workflow-flow-canvas';
import { renderUi } from '@/tests/support/render-ui';

describe('WorkflowFlowCanvas', () => {
  afterEach(cleanup);

  it('keeps Outcome route handles and edge labels visible', () => {
    renderUi(
      createElement(WorkflowFlowCanvas, {
        graph: {
          nodes: [
            {
              id: 'trigger',
              type: 'TRIGGER',
              trigger: { type: 'MANUAL' },
              position: { x: 0, y: 0 },
            },
            { id: 'outcome', type: 'PIPELINE_OUTCOME', position: { x: 200, y: 0 } },
          ],
          edges: [
            {
              id: 'route-error',
              sourceNodeId: 'outcome',
              sourcePortId: 'error',
              targetNodeId: 'trigger',
              targetPortId: 'in',
            },
          ],
        },
        onConnect: vi.fn(),
        onMove: vi.fn(),
        onSelectNode: vi.fn(),
        onSelectEdge: vi.fn(),
        onClearSelection: vi.fn(),
        onDeleteNode: vi.fn(),
        onDeleteEdge: vi.fn(),
      }),
    );
    expect(screen.getByRole('button', { name: 'Success output' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Error output' })).toBeTruthy();
    expect(screen.getAllByText('Error').length).toBeGreaterThan(0);
  });

  it('shows named conditional routes directly beside their connection handles', () => {
    renderUi(
      createElement(WorkflowFlowCanvas, {
        graph: {
          nodes: [
            {
              id: 'trigger',
              type: 'TRIGGER',
              trigger: { type: 'MANUAL' },
              position: { x: 0, y: 0 },
            },
            {
              id: 'split',
              type: 'CONDITIONAL_SPLIT',
              mode: 'ALL_MATCH',
              branches: [
                { id: 'route-a', condition: { op: 'eq', path: ['trigger', 'type'], value: 'A' } },
                { id: 'route-b', condition: { op: 'ne', path: ['trigger', 'type'], value: 'B' } },
                { id: 'fallback', fallback: true },
              ],
              position: { x: 200, y: 0 },
            },
            {
              id: 'pipeline',
              type: 'PIPELINE',
              pipelineId: 'pipeline-1',
              versionNumber: 1,
              position: { x: 450, y: 0 },
            },
          ],
          edges: [
            {
              id: 'route',
              sourceNodeId: 'split',
              sourcePortId: 'route-a',
              targetNodeId: 'pipeline',
              targetPortId: 'in',
            },
          ],
        },
        onConnect: vi.fn(),
        onMove: vi.fn(),
        onSelectNode: vi.fn(),
        onSelectEdge: vi.fn(),
        onClearSelection: vi.fn(),
        onDeleteNode: vi.fn(),
        onDeleteEdge: vi.fn(),
      }),
    );

    expect(screen.getByText('Condition 1 · trigger.type is A')).toBeTruthy();
    expect(screen.getByText('Condition 2 · trigger.type is not B')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Connect Condition 1 · trigger.type is A' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect Fallback' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pipeline input' })).toBeTruthy();
  });

  it('prevents Outcome edges from connecting to non-pipeline nodes', () => {
    renderUi(
      createElement(WorkflowFlowCanvas, {
        graph: {
          nodes: [
            {
              id: 'trigger',
              type: 'TRIGGER',
              trigger: { type: 'MANUAL' },
              position: { x: 0, y: 0 },
            },
            { id: 'outcome', type: 'PIPELINE_OUTCOME', position: { x: 200, y: 0 } },
            {
              id: 'pipeline',
              type: 'PIPELINE',
              pipelineId: 'pipeline-1',
              versionNumber: 1,
              position: { x: 400, y: 0 },
            },
          ],
          edges: [],
        },
        onConnect: vi.fn(),
        onMove: vi.fn(),
        onSelectNode: vi.fn(),
        onSelectEdge: vi.fn(),
        onClearSelection: vi.fn(),
        onDeleteNode: vi.fn(),
        onDeleteEdge: vi.fn(),
      }),
    );

    expect(screen.getByLabelText('Outcome to trigger allowed').textContent).toBe('false');
    expect(screen.getByLabelText('Outcome to pipeline allowed').textContent).toBe('true');
  });

  it('tracks drag frames locally and commits only the final position', () => {
    const onMove = vi.fn();
    renderUi(
      createElement(WorkflowFlowCanvas, {
        graph: {
          nodes: [
            {
              id: 'trigger',
              type: 'TRIGGER' as const,
              trigger: { type: 'MANUAL' as const },
              position: { x: 0, y: 0 },
            },
          ],
          edges: [],
        },
        onConnect: vi.fn(),
        onMove,
        onSelectNode: vi.fn(),
        onSelectEdge: vi.fn(),
        onClearSelection: vi.fn(),
        onDeleteNode: vi.fn(),
        onDeleteEdge: vi.fn(),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Drag frame' }));
    expect(screen.getByLabelText('Node position').textContent).toBe('80,40');
    expect(onMove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Drag end' }));
    expect(onMove).toHaveBeenCalledWith('trigger', { x: 90, y: 50 });
  });

  it('forwards deletions while keeping the trigger non-deletable', () => {
    const onDeleteNode = vi.fn();
    const onDeleteEdge = vi.fn();
    renderUi(
      createElement(WorkflowFlowCanvas, {
        graph: {
          nodes: [
            {
              id: 'trigger',
              type: 'TRIGGER' as const,
              trigger: { type: 'MANUAL' as const },
              position: { x: 0, y: 0 },
            },
            {
              id: 'pipeline',
              type: 'PIPELINE' as const,
              pipelineId: 'pipeline-1',
              versionNumber: 1,
              position: { x: 300, y: 0 },
            },
          ],
          edges: [
            {
              id: 'edge-1',
              sourceNodeId: 'trigger',
              sourcePortId: 'out',
              targetNodeId: 'pipeline',
              targetPortId: 'in',
            },
          ],
        },
        pipelineNames: new Map([['pipeline-1', 'Orders ingest']]),
        onConnect: vi.fn(),
        onMove: vi.fn(),
        onSelectNode: vi.fn(),
        onSelectEdge: vi.fn(),
        onClearSelection: vi.fn(),
        onDeleteNode,
        onDeleteEdge,
      }),
    );

    expect(screen.getByText('Orders ingest')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete rendered node' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete rendered edge' }));

    expect(onDeleteNode).toHaveBeenCalledOnce();
    expect(onDeleteNode).toHaveBeenCalledWith('pipeline');
    expect(onDeleteEdge).toHaveBeenCalledWith('edge-1');
  });
});

// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TutorialDetailPanel } from '@/app/_components/tutorials/tutorial-detail-panel';
import { defaultLocale } from '@/app/_i18n/locales';
import { useLocaleStore } from '@/app/_stores/locale.store';
import type { DetailViewModel } from '@/src/interface-adapters/presenters/tutorial-detail.presenter';
import { renderUi as render } from '@/tests/support/render-ui';

const readyDetail: DetailViewModel = {
  tutorialId: 'tutorial-1',
  experience: { mode: 'WORKSPACE' },
  metadata: {
    title: 'Create a database connection',
    summary: 'Connect an authorized workspace database.',
    category: 'Databases',
    learningOutcomes: ['Choose a database', 'Verify the connection'],
    estimatedMinutes: 12,
    stepCount: 3,
  },
  prerequisiteStates: [
    {
      id: 'can-create',
      description: 'Database creation access',
      informational: false,
      satisfied: true,
      remediation: null,
    },
    {
      id: 'has-credentials',
      description: 'Connection credentials are available',
      informational: false,
      satisfied: false,
      remediation: {
        label: 'Open connection settings',
        href: '/settings/connections',
      },
    },
  ],
  contextSelectors: [
    {
      id: 'database:1',
      requirementId: 'database',
      resourceType: 'DATABASE',
      options: [
        { id: 'db-1', name: 'Production reporting' },
        { id: 'db-2', name: 'Development sandbox' },
      ],
      selectedResourceId: 'db-2',
      selectedResourceName: 'Development sandbox',
    },
  ],
  startEnabled: true,
};

function detailWith(overrides: Partial<DetailViewModel>): DetailViewModel {
  return { ...readyDetail, ...overrides };
}

afterEach(() => {
  cleanup();
  useLocaleStore.setState({ locale: defaultLocale });
});

describe('TutorialDetailPanel', () => {
  it('renders complete metadata, prerequisite states, remediation, and selected context names', () => {
    render(
      createElement(TutorialDetailPanel, {
        detail: readyDetail,
        onContextSelectionChange: vi.fn(),
        onStart: vi.fn(),
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'Create a database connection', level: 2 }),
    ).toBeTruthy();
    expect(screen.getByText('Connect an authorized workspace database.')).toBeTruthy();
    expect(screen.getByText('Databases')).toBeTruthy();
    expect(screen.getByText('12 minutes')).toBeTruthy();
    expect(screen.getByText('3 steps')).toBeTruthy();
    expect(screen.getByText('Choose a database')).toBeTruthy();
    expect(screen.getByText('Verify the connection')).toBeTruthy();

    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('Action required')).toBeTruthy();
    expect(screen.getByText('Database creation access')).toBeTruthy();
    expect(screen.getByText('Connection credentials are available')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Open connection settings' }).getAttribute('href'),
    ).toBe('/settings/connections');

    const selector = screen.getByRole('combobox', { name: 'Choose DATABASE' });
    expect((selector as HTMLSelectElement).value).toBe('db-2');
    expect(screen.getByText('Selected: Development sandbox')).toBeTruthy();
  });

  it('shows an informational prerequisite without claiming it was automatically verified', () => {
    render(
      createElement(TutorialDetailPanel, {
        detail: detailWith({
          prerequisiteStates: [
            {
              id: 'postgresql-access',
              description: 'Access to a PostgreSQL database and its connection details.',
              informational: true,
              satisfied: true,
              remediation: null,
            },
          ],
        }),
        onContextSelectionChange: vi.fn(),
        onStart: vi.fn(),
      }),
    );

    expect(
      screen.getByText('Access to a PostgreSQL database and its connection details.'),
    ).toBeTruthy();
    expect(screen.queryByText('Ready')).toBeNull();
    expect(screen.queryByText('Action required')).toBeNull();
  });

  it('reports context selection and gates the start action with startEnabled', () => {
    const onContextSelectionChange = vi.fn();
    const onStart = vi.fn();
    const { rerender } = render(
      createElement(TutorialDetailPanel, {
        detail: detailWith({ startEnabled: false }),
        onContextSelectionChange,
        onStart,
      }),
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Choose DATABASE' }), {
      target: { value: 'db-1' },
    });
    expect(onContextSelectionChange).toHaveBeenCalledWith('database:1', 'db-1');

    const unavailableStart = screen.getByRole('button', { name: 'Start tutorial' });
    expect((unavailableStart as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText('Complete all prerequisites and context selections to start.'),
    ).toBeTruthy();
    fireEvent.click(unavailableStart);
    expect(onStart).not.toHaveBeenCalled();

    rerender(
      createElement(TutorialDetailPanel, {
        detail: readyDetail,
        onContextSelectionChange,
        onStart,
      }),
    );
    const availableStart = screen.getByRole('button', { name: 'Start tutorial' });
    expect((availableStart as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(availableStart);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('renders empty prerequisite and unavailable context states with localized labels', () => {
    useLocaleStore.setState({ locale: 'vi' });
    render(
      createElement(TutorialDetailPanel, {
        detail: detailWith({
          prerequisiteStates: [],
          contextSelectors: [
            {
              id: 'pipeline:1',
              requirementId: 'pipeline',
              resourceType: 'PIPELINE',
              options: [],
              selectedResourceId: null,
              selectedResourceName: null,
            },
          ],
          startEnabled: false,
        }),
        onContextSelectionChange: vi.fn(),
        onStart: vi.fn(),
      }),
    );

    expect(screen.getByText('Không có điều kiện tiên quyết.')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Chọn PIPELINE' })).toBeTruthy();
    expect(screen.getByText('Không có tài nguyên nào bạn được phép truy cập.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bắt đầu hướng dẫn' })).toBeTruthy();
  });

  it('exposes a localized busy state and prevents duplicate starts', () => {
    const onStart = vi.fn();
    render(
      createElement(TutorialDetailPanel, {
        detail: readyDetail,
        onContextSelectionChange: vi.fn(),
        onStart,
        starting: true,
      }),
    );

    const start = screen.getByRole('button', { name: /Starting tutorial/ });
    expect(start.getAttribute('aria-busy')).toBe('true');
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(start);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('labels an active tutorial as a continuation instead of a new start', () => {
    const onStartFresh = vi.fn();
    render(
      createElement(TutorialDetailPanel, {
        action: 'continue',
        detail: readyDetail,
        onContextSelectionChange: vi.fn(),
        onStartFresh,
        onStart: vi.fn(),
      }),
    );

    const continueTutorial = screen.getByRole('button', { name: 'Continue tutorial' });
    expect((continueTutorial as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Start fresh' }));
    expect(onStartFresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Start tutorial' })).toBeNull();
  });

  it('labels a completed tutorial as repeatable', () => {
    render(
      createElement(TutorialDetailPanel, {
        action: 'repeat',
        detail: readyDetail,
        onContextSelectionChange: vi.fn(),
        onStart: vi.fn(),
      }),
    );

    const repeatTutorial = screen.getByRole('button', { name: 'Repeat tutorial' });
    expect((repeatTutorial as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Start tutorial' })).toBeNull();
  });
});

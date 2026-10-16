// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@atomic-editor/editor', () => ({
  AtomicCodeMirrorEditor: ({
    markdownSource,
    onMarkdownChange,
    readOnly,
  }: {
    readonly markdownSource: string;
    readonly onMarkdownChange?: (markdown: string) => void;
    readonly readOnly?: boolean;
  }) => (
    <textarea
      aria-label="Markdown body"
      aria-readonly={readOnly || undefined}
      data-read-only={readOnly ? 'true' : undefined}
      readOnly={readOnly}
      value={markdownSource}
      onChange={(event) => onMarkdownChange?.(event.target.value)}
    />
  ),
}));

import {
  SkillsScreen,
  type SkillsControllers,
} from '@/app/(workspace)/skills/_components/skills-screen';
import type { SkillDetail, SkillSummary } from '@/src/entities/models/skill';
import { renderUi } from '@/tests/support/render-ui';

const ORIGINAL_AGENT_NAME = process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME;
beforeAll(() => {
  process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME = 'skill-creator';
});
afterAll(() => {
  process.env.NEXT_PUBLIC_SKILL_CHAT_AGENT_NAME = ORIGINAL_AGENT_NAME;
});

const projectSummary: SkillSummary = {
  name: 'project-review',
  description: 'Review project changes',
  namespace: 'project',
  source: 'project',
};

const globalSummary: SkillSummary = {
  name: 'global-format',
  description: 'Format responses consistently',
  namespace: 'global',
  source: 'global',
};

const projectDetail: SkillDetail = {
  ...projectSummary,
  body: '# Review\n\nCheck the changed files.',
};

const globalDetail: SkillDetail = {
  ...globalSummary,
  body: '# Format\n\nUse concise answers.',
};

function createControllers(overrides: Partial<SkillsControllers> = {}): SkillsControllers {
  return {
    list: vi.fn().mockResolvedValue([projectSummary, globalSummary]),
    get: vi.fn().mockResolvedValue(projectDetail),
    create: vi.fn().mockResolvedValue(projectDetail),
    update: vi.fn().mockResolvedValue(projectDetail),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderScreen(controllers: SkillsControllers = createControllers()) {
  return renderUi(<SkillsScreen controllers={controllers} />);
}

/** The row's own button, not the `Actions for …` menu beside it. */
function skillRow(name: string) {
  return screen.getByRole('button', { name, exact: true });
}

async function findSkillRow(name: string) {
  return screen.findByRole('button', { name, exact: true });
}

/** Open the confirmation and accept it. Delete is an AlertDialog, not window.confirm. */
async function confirmDelete() {
  fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
  fireEvent.click(await screen.findByRole('button', { name: /^delete skill$/i }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SkillsScreen', () => {
  it('shows initial list loading and then groups skills by source', async () => {
    let resolveList: ((value: readonly SkillSummary[]) => void) | undefined;
    const list = vi.fn(
      () =>
        new Promise<readonly SkillSummary[]>((resolve) => {
          resolveList = resolve;
        }),
    );
    const controllers = createControllers({ list });

    renderScreen(controllers);

    expect(screen.getByRole('status', { name: /loading skills/i })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Skills' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Available skills' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Select a skill' })).toBeTruthy();
    resolveList?.([projectSummary, globalSummary]);

    expect(await findSkillRow('project-review')).toBeTruthy();
    expect(skillRow('global-format')).toBeTruthy();
    // Source is the grouping now, so it is a heading instead of a badge repeated
    // on every row.
    expect(screen.getByRole('heading', { level: 2, name: 'Project skills' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Global skills' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Project skills' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Global skills' })).toBeTruthy();
  });

  it('splits into two columns on available width, not on window width', () => {
    const { container } = renderScreen();

    const contentGrid = container.querySelector('[data-skills-layout]');
    const queryContainer = contentGrid?.parentElement;
    const screenLayout = queryContainer?.parentElement;

    // The assistant dock takes 400px whenever it is open, so the grid's width is
    // not a function of the window. It used to be min-[1080px] on the shell and
    // min-[1081px] on the grid, one pixel apart, and neither could see the dock.
    expect(queryContainer?.className).toContain('@container/skills');
    expect(contentGrid?.className).toContain('@[52rem]/skills:grid-cols-');
    expect(contentGrid?.className).toContain('minmax(280px,0.8fr)');
    expect(contentGrid?.className).toContain('minmax(0,1.4fr)');
    expect(contentGrid?.className).toContain('min-h-0');
    expect(screenLayout?.className).toContain('xl:gap-4');
    expect(screenLayout?.className).toContain('xl:pl-4');
    expect(screenLayout?.className).toContain('xl:h-screen');
    expect(screenLayout?.className).not.toContain('min-[1080px]');
    expect(contentGrid?.className).not.toContain('min-[1081px]');
  });

  it('offers the assistant as a toggle instead of opening with it', async () => {
    renderScreen();

    // `/skills` was the only surface that booted with the 400px dock over half
    // the width. It is now `defaultOpen: false` with a toggle, as `/databases`
    // has always been.
    const toggle = await screen.findByRole('button', { name: 'Assistant' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('heading', { name: /ask about your skills/i })).toBeNull();
  });

  it('leaves the workspace shell as the only main landmark', () => {
    const { container } = renderScreen();

    // The shell already renders <main>; a second one is an ambiguous landmark.
    expect(container.querySelectorAll('main')).toHaveLength(0);
  });

  it('shows an inline required error and skips creation when the name is empty', async () => {
    const create = vi.fn().mockResolvedValue(projectDetail);
    const controllers = createControllers({ create });
    renderScreen(controllers);

    fireEvent.click(await screen.findByRole('button', { name: /create skill/i }));
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect((await screen.findByText(/enter a name for the skill/i)).textContent).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a skill when only the name is provided', async () => {
    const created: SkillDetail = {
      name: 'minimal-skill',
      description: '',
      namespace: '',
      body: '',
      source: 'project',
    };
    const create = vi.fn().mockResolvedValue(created);
    const list = vi
      .fn()
      .mockResolvedValueOnce([projectSummary, globalSummary])
      .mockResolvedValue([projectSummary, globalSummary, created]);
    const controllers = createControllers({ create, list });
    renderScreen(controllers);

    fireEvent.click(await screen.findByRole('button', { name: /create skill/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: created.name } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        name: created.name,
        description: '',
        namespace: '',
        body: '',
      });
    });
  });

  it('loads and renders the selected project skill detail', async () => {
    const get = vi.fn().mockResolvedValue(projectDetail);
    renderScreen(createControllers({ get }));

    fireEvent.click(await findSkillRow('project-review'));

    const markdownBody = await screen.findByLabelText(/markdown body/i);
    expect(markdownBody).toHaveProperty('value', projectDetail.body);
    expect(get).toHaveBeenCalledWith(projectSummary.name);

    // The name is the pane's heading now, which is both where it belongs and
    // why it is no longer a text input explaining that it cannot be edited.
    expect(screen.getByRole('heading', { level: 2, name: projectDetail.name })).toBeTruthy();
    expect(screen.queryByLabelText(/^name$/i)).toBeNull();

    expect(screen.getByLabelText(/^description$/i)).toHaveProperty(
      'value',
      projectDetail.description,
    );
    expect(screen.getByLabelText(/^namespace$/i)).toHaveProperty('value', projectDetail.namespace);
  });

  it('previews the index line the agent will route on', async () => {
    renderScreen();

    fireEvent.click(await findSkillRow('project-review'));
    await screen.findByLabelText(/markdown body/i);

    // `build_index()` composes `- **{name}** — {description}` and the agent
    // chooses from that line alone, so the form shows it as it will be written.
    expect(screen.getByText(/how the agent sees this skill/i)).toBeTruthy();
    const preview = screen.getByText(/how the agent sees this skill/i).parentElement;
    expect(preview?.textContent).toContain('project-review');
    expect(preview?.textContent).toContain('Review project changes');

    fireEvent.change(screen.getByLabelText(/^description$/i), {
      target: { value: 'Use when the user asks for a review.' },
    });
    expect(preview?.textContent).toContain('Use when the user asks for a review.');
  });

  it('warns that a skill with no description cannot be routed to', async () => {
    const undescribed: SkillSummary = {
      name: 'undescribed-skill',
      description: '',
      namespace: '',
      source: 'project',
    };
    renderScreen(
      createControllers({ list: vi.fn().mockResolvedValue([projectSummary, undescribed]) }),
    );

    await findSkillRow('undescribed-skill');
    expect(screen.getByText(/the agent has only the name to decide from/i)).toBeTruthy();
  });

  it('renders global skill fields read-only without mutation controls', async () => {
    const get = vi.fn().mockResolvedValue(globalDetail);
    renderScreen(createControllers({ get }));

    fireEvent.click(await findSkillRow('global-format'));

    await screen.findByLabelText(/markdown body/i);
    expect(screen.getByLabelText(/^description$/i)).toHaveProperty('disabled', true);
    expect(screen.getByLabelText(/^namespace$/i)).toHaveProperty('disabled', true);
    const markdownBody = screen.getByLabelText(/markdown body/i);
    expect(markdownBody).toHaveProperty('readOnly', true);

    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull();
    expect(screen.getByText(/global skills are read-only/i)).toBeTruthy();
    // A global row offers no destructive menu either.
    expect(screen.queryByRole('button', { name: /actions for global-format/i })).toBeNull();
  });

  it('edits a project skill and sends the complete form through updateSkill', async () => {
    const updated: SkillDetail = {
      ...projectDetail,
      description: 'Updated description',
      namespace: 'updated',
      body: '# Updated\n\nNew content.',
    };
    const update = vi.fn().mockResolvedValue(updated);
    const controllers = createControllers({ update });
    renderScreen(controllers);

    fireEvent.click(await findSkillRow('project-review'));
    await screen.findByLabelText(/markdown body/i);

    fireEvent.change(screen.getByLabelText(/^description$/i), {
      target: { value: updated.description },
    });
    fireEvent.change(screen.getByLabelText(/^namespace$/i), {
      target: { value: updated.namespace },
    });
    fireEvent.change(screen.getByLabelText(/markdown body/i), {
      target: { value: updated.body },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        name: projectDetail.name,
        description: updated.description,
        namespace: updated.namespace,
        body: updated.body,
      });
    });

    expect(await screen.findByLabelText(/markdown body/i)).toHaveProperty('value', updated.body);
    expect(skillRow('project-review').getAttribute('aria-current')).toBe('true');
  });

  it('accepts empty editable fields during updates and never resends the name', async () => {
    const cleared: SkillDetail = {
      ...projectDetail,
      description: '',
      namespace: '',
      body: '',
    };
    const update = vi.fn().mockResolvedValue(cleared);
    renderScreen(createControllers({ update }));

    fireEvent.click(await findSkillRow('project-review'));
    await screen.findByLabelText(/markdown body/i);

    fireEvent.change(screen.getByLabelText(/^description$/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/^namespace$/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/markdown body/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith({
        name: projectDetail.name,
        description: '',
        namespace: '',
        body: '',
      });
    });
  });

  it('shows detail loading and ignores a stale response after selecting another skill', async () => {
    const skillA: SkillSummary = { ...projectSummary, name: 'skill-a' };
    const skillB: SkillSummary = { ...projectSummary, name: 'skill-b' };
    const detailA: SkillDetail = { ...skillA, body: '# A' };
    const detailB: SkillDetail = { ...skillB, body: '# B' };

    let resolveA: ((value: SkillDetail) => void) | undefined;
    const get = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<SkillDetail>((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockResolvedValueOnce(detailB);
    const controllers = createControllers({
      get,
      list: vi.fn().mockResolvedValue([skillA, skillB]),
    });
    renderScreen(controllers);

    fireEvent.click(await findSkillRow('skill-a'));
    expect(screen.getByRole('status', { name: /loading skill details/i })).toBeTruthy();
    fireEvent.click(skillRow('skill-b'));

    expect(await screen.findByLabelText(/markdown body/i)).toHaveProperty('value', detailB.body);
    resolveA?.(detailA);
    await waitFor(() => {
      expect(screen.getByLabelText(/markdown body/i)).toHaveProperty('value', detailB.body);
    });
    expect(skillRow('skill-b').getAttribute('aria-current')).toBe('true');
  });

  it('creates a skill, refreshes the list, and selects the returned detail', async () => {
    const created: SkillDetail = {
      name: 'created-skill',
      description: 'Created description',
      namespace: 'created',
      body: '# Created',
      source: 'project',
    };
    const create = vi.fn().mockResolvedValue(created);
    const list = vi
      .fn()
      .mockResolvedValueOnce([projectSummary])
      .mockResolvedValue([projectSummary, created]);
    renderScreen(createControllers({ create, list }));

    fireEvent.click(await screen.findByRole('button', { name: /create skill/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: created.name } });
    fireEvent.change(screen.getByLabelText(/^description$/i), {
      target: { value: created.description },
    });
    fireEvent.change(screen.getByLabelText(/^namespace$/i), {
      target: { value: created.namespace },
    });
    fireEvent.change(screen.getByLabelText(/markdown body/i), { target: { value: created.body } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(await findSkillRow('created-skill')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: created.name })).toBeTruthy();
    expect(screen.getByLabelText(/markdown body/i)).toHaveProperty('value', created.body);
  });

  it('returns to the previously open skill when creation is cancelled', async () => {
    renderScreen();

    fireEvent.click(await findSkillRow('project-review'));
    await screen.findByLabelText(/markdown body/i);

    fireEvent.click(screen.getByRole('button', { name: /create skill/i }));
    expect(await screen.findByLabelText(/^name$/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Cancel used to drop you on the empty state even though a skill was open.
    expect(await screen.findByRole('heading', { level: 2, name: projectDetail.name })).toBeTruthy();
    expect(skillRow('project-review').getAttribute('aria-current')).toBe('true');
  });

  it('confirms deletion in a dialog, refreshes the list, and clears the detail', async () => {
    const deleteSkill = vi.fn().mockResolvedValue(undefined);
    const list = vi
      .fn()
      .mockResolvedValueOnce([projectSummary, globalSummary])
      .mockResolvedValue([globalSummary]);
    renderScreen(createControllers({ delete: deleteSkill, list }));

    fireEvent.click(await findSkillRow('project-review'));
    await screen.findByLabelText(/markdown body/i);
    await confirmDelete();

    await waitFor(() => {
      expect(deleteSkill).toHaveBeenCalledWith(projectSummary.name);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'project-review', exact: true })).toBeNull();
    });
    expect(screen.getByRole('heading', { level: 3, name: 'Select a skill' })).toBeTruthy();
  });

  it('does not delete when the dialog is dismissed', async () => {
    const deleteSkill = vi.fn().mockResolvedValue(undefined);
    renderScreen(createControllers({ delete: deleteSkill }));

    fireEvent.click(await findSkillRow('project-review'));
    await screen.findByLabelText(/markdown body/i);
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(new RegExp(projectSummary.name, 'i'))).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(deleteSkill).not.toHaveBeenCalled();
  });

  it('deletes from the row menu without opening the skill first', async () => {
    const deleteSkill = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue(projectDetail);
    renderScreen(createControllers({ delete: deleteSkill, get }));

    await findSkillRow('project-review');
    fireEvent.keyDown(screen.getByRole('button', { name: /actions for project-review/i }), {
      key: 'ArrowDown',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: /^delete$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^delete skill$/i }));

    await waitFor(() => {
      expect(deleteSkill).toHaveBeenCalledWith(projectSummary.name);
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('renders list, detail, save, create, and delete failures as alerts', async () => {
    const listFailure = createControllers({
      list: vi.fn().mockRejectedValue(new Error('list failed')),
    });
    renderScreen(listFailure);
    expect((await screen.findByRole('alert')).textContent).toMatch(/list failed/i);

    cleanup();
    const detailFailure = createControllers({
      get: vi.fn().mockRejectedValue(new Error('detail failed')),
    });
    renderScreen(detailFailure);
    fireEvent.click(await findSkillRow('project-review'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/detail failed/i);

    cleanup();
    const saveFailure = createControllers({
      update: vi.fn().mockRejectedValue(new Error('save failed')),
    });
    renderScreen(saveFailure);
    fireEvent.click(await findSkillRow('project-review'));
    await screen.findByLabelText(/markdown body/i);
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/save failed/i);

    cleanup();
    const createFailure = createControllers({
      create: vi.fn().mockRejectedValue(new Error('create failed')),
    });
    renderScreen(createFailure);
    fireEvent.click(await screen.findByRole('button', { name: /create skill/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'new-skill' } });
    fireEvent.change(screen.getByLabelText(/^description$/i), { target: { value: 'description' } });
    fireEvent.change(screen.getByLabelText(/^namespace$/i), { target: { value: 'project' } });
    fireEvent.change(screen.getByLabelText(/markdown body/i), { target: { value: '# body' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/create failed/i);

    cleanup();
    const deleteFailure = createControllers({
      delete: vi.fn().mockRejectedValue(new Error('delete failed')),
    });
    renderScreen(deleteFailure);
    fireEvent.click(await findSkillRow('project-review'));
    await screen.findByLabelText(/markdown body/i);
    await confirmDelete();
    expect((await screen.findByRole('alert')).textContent).toMatch(/delete failed/i);
  });

  it('disables conflicting controls and exposes busy state while saving', async () => {
    let resolveUpdate: ((value: SkillDetail) => void) | undefined;
    const update = vi.fn(
      () =>
        new Promise<SkillDetail>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const controllers = createControllers({ update });
    renderScreen(controllers);

    fireEvent.click(await findSkillRow('project-review'));
    await screen.findByLabelText(/markdown body/i);
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(screen.getByRole('button', { name: /saving/i })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /^delete$/i })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: /saving/i }).getAttribute('aria-busy')).toBe('true');
    resolveUpdate?.(projectDetail);
  });

  it('disables conflicting controls and exposes busy state while deleting', async () => {
    let resolveDelete: (() => void) | undefined;
    const deleteSkill = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    renderScreen(createControllers({ delete: deleteSkill }));

    fireEvent.click(await findSkillRow('project-review'));
    await screen.findByLabelText(/markdown body/i);
    await confirmDelete();

    const deletingButton = await screen.findByRole('button', { name: /deleting/i });
    expect(deletingButton).toHaveProperty('disabled', true);
    expect(deletingButton.getAttribute('aria-busy')).toBe('true');
    resolveDelete?.();
  });
});

describe('SkillsScreen library', () => {
  const many: readonly SkillSummary[] = [
    { name: 'alpha-check', description: 'Alpha', namespace: 'quality', source: 'project' },
    { name: 'beta-check', description: 'Beta', namespace: 'quality', source: 'project' },
    { name: 'gamma-report', description: 'Gamma', namespace: 'reporting', source: 'project' },
    { name: 'delta-report', description: 'Delta', namespace: 'reporting', source: 'project' },
    { name: 'epsilon-loose', description: 'Epsilon', namespace: '', source: 'project' },
    { name: 'zeta-global', description: 'Zeta', namespace: '', source: 'global' },
    { name: 'eta-global', description: 'Eta', namespace: '', source: 'global' },
    { name: 'theta-global', description: 'Theta', namespace: '', source: 'global' },
  ];

  it('hides the filter until the library is large enough to need one', async () => {
    renderScreen();

    await findSkillRow('project-review');
    expect(screen.queryByRole('searchbox', { name: /search skills/i })).toBeNull();
  });

  it('filters across name, description and namespace once the library is large', async () => {
    renderScreen(createControllers({ list: vi.fn().mockResolvedValue(many) }));

    await findSkillRow('alpha-check');
    const search = screen.getByRole('searchbox', { name: /search skills/i });

    // `reporting` is a namespace, which no longer appears in the list but still
    // matches, so the filter reaches a grouping the eye cannot see.
    fireEvent.change(search, { target: { value: 'reporting' } });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'alpha-check', exact: true })).toBeNull();
    });
    expect(skillRow('gamma-report')).toBeTruthy();
    expect(skillRow('delta-report')).toBeTruthy();
    // A source with no matches is dropped rather than left as an empty heading.
    expect(screen.queryByRole('heading', { level: 2, name: 'Global skills' })).toBeNull();

    fireEvent.change(search, { target: { value: 'Theta' } });
    expect(await findSkillRow('theta-global')).toBeTruthy();

    fireEvent.change(search, { target: { value: 'nothing-matches-this' } });
    expect(await screen.findByText(/no skill matches/i)).toBeTruthy();
  });

  it('groups by source only, with one list per source', async () => {
    renderScreen(createControllers({ list: vi.fn().mockResolvedValue(many) }));

    await findSkillRow('alpha-check');

    const library = screen.getByRole('region', { name: 'Available skills' });
    expect(
      within(library)
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(['Project skills', 'Global skills']);
    // Namespace is a free-text label with no consumer in the agent. Splitting a
    // handful of skills across two or three of them costs more headings than it
    // saves scanning, so it does not group — it stays on the form and searchable.
    expect(within(library).queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(within(library).getAllByRole('list')).toHaveLength(2);
    expect(within(library).getByRole('list', { name: 'Project skills' })).toBeTruthy();
  });

  it('sorts each source by name', async () => {
    renderScreen(createControllers({ list: vi.fn().mockResolvedValue(many) }));

    await findSkillRow('alpha-check');
    const project = screen.getByRole('list', { name: 'Project skills' });
    const names = within(project)
      .getAllByRole('listitem')
      .map((row) => row.querySelector('button')?.textContent);
    expect(names).toEqual([
      'alpha-check',
      'beta-check',
      'delta-report',
      'epsilon-loose',
      'gamma-report',
    ]);
  });

  it('counts each group rather than the library as a whole', async () => {
    renderScreen(createControllers({ list: vi.fn().mockResolvedValue(many) }));

    await findSkillRow('alpha-check');
    expect(screen.getByText('5 skills')).toBeTruthy();
    expect(screen.getByText('3 skills')).toBeTruthy();
  });

  it('shows a real empty state when the library has nothing in it', async () => {
    renderScreen(createControllers({ list: vi.fn().mockResolvedValue([]) }));

    expect(
      await screen.findByRole('heading', { level: 3, name: /no skills are available/i }),
    ).toBeTruthy();
    // One CTA on the screen: the header button, not a second copy in the panel.
    expect(screen.getAllByRole('button', { name: /create skill/i })).toHaveLength(1);
  });
});

describe('SkillsScreen form', () => {
  it('constrains the two-column layout and long skill rows to the available width', async () => {
    const { container } = renderScreen();

    const grid = container.querySelector('[data-skills-layout]');
    const row = await findSkillRow('project-review');
    const list = screen.getByRole('list', { name: 'Project skills' });
    const listItem = row.closest('[data-slot="item"]');
    const cardContent = list.closest('[data-slot="card-content"]');
    const cards = [...document.querySelectorAll('[data-slot="card"]')];

    expect(grid?.className).toContain('min-w-0');
    // The list column has a floor so it cannot collapse; at 0.7fr it rendered
    // roughly 140px wide once the 400px assistant dock opened.
    expect(grid?.className).toContain('minmax(280px,0.8fr)');
    expect(cards.every((card) => card.className.includes('overflow-hidden'))).toBe(true);
    expect(cardContent?.className).toContain('overflow-y-auto');
    expect(cardContent?.className).toContain('min-w-0');
    expect(list.className).toContain('min-w-0');
    expect(listItem?.className).toContain('flex-nowrap');
    expect(row.className).toContain('truncate');
  });

  it('rejects an invalid skill name with an inline pattern error and does not call create', async () => {
    const create = vi.fn().mockResolvedValue(projectDetail);
    renderScreen(createControllers({ create }));

    fireEvent.click(await screen.findByRole('button', { name: /create skill/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Bad Name!' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(
      (await screen.findByText(/lowercase letters, digits, and hyphens/i)).textContent,
    ).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps description and namespace as single-line inputs so newlines cannot be entered', async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /create skill/i }));

    // A single-line <input> (not a <textarea>) is the client-side guarantee that
    // matches the backend "no newline in description/namespace" rule.
    expect(screen.getByLabelText(/^description$/i).tagName).toBe('INPUT');
    expect(screen.getByLabelText(/^namespace$/i).tagName).toBe('INPUT');
    // Only the Markdown body is a multi-line textarea.
    expect(screen.getByLabelText(/markdown body/i).tagName).toBe('TEXTAREA');
  });

  it('describes what each field decides rather than where it is shown', async () => {
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /create skill/i }));

    expect(screen.getByText(/example: data-quality-check/i)).toBeTruthy();
    // The description is the routing key, and the hint used to call it a caption.
    expect(screen.getByText(/decides when the agent uses this skill/i)).toBeTruthy();
    expect(screen.getByText(/the agent does not read it/i)).toBeTruthy();
    expect(screen.getByText(/markdown instructions the agent follows/i)).toBeTruthy();
  });

  it('keeps Save/Create visible without widening the form', async () => {
    const { container } = renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: /create skill/i }));
    const createButton = await screen.findByRole('button', { name: /^create$/i });
    const actionBar = createButton.parentElement;
    const form = container.querySelector('form');
    const body = screen.getByLabelText(/markdown body/i).closest('[data-editor="atomic"]');

    expect(body).not.toBeNull();
    if (!body) throw new Error('Markdown editor host not found');

    // The bar is a sibling of the form, not a strip inside it. Inside, it used
    // `-mx-6` to bleed to the card edge, which made the form 22px wider than its
    // own content box at every width and put a horizontal scrollbar on the card.
    // It also sat on `mt-auto`, so once the editor's min-height overflowed the
    // form the bar detached and landed in the middle of the fields.
    expect(form?.contains(actionBar as Node)).toBe(false);
    expect(actionBar?.previousElementSibling).toBe(form);
    expect(actionBar?.className).not.toContain('-mx-');
    expect(actionBar?.className).not.toContain('mt-auto');
    // Still reachable while the column scrolls in the stacked layout.
    expect(actionBar?.className).toContain('sticky');
    expect(actionBar?.className).toContain('bottom-0');
    // Submitting from outside the form works by association.
    expect(createButton.getAttribute('form')).toBe(form?.getAttribute('id'));

    // The body editor shares the scroll region rather than forcing a height that
    // pushes the actions below the fold.
    expect(body.className).toContain('flex-1');
    expect(body.className).not.toContain('h-[min(60dvh,40rem)]');
  });
});

// @vitest-environment jsdom

/* eslint-disable react/no-children-prop --
 * Tests are plain .ts files, so elements are built with createElement. Passing
 * children through props keeps the required `children` prop type-checked. */

import { createElement } from 'react';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '@/tests/support/render-ui';
import { Button } from '@/app/_components/ui/button';
import { Checkbox } from '@/app/_components/ui/checkbox';
import { DataTable } from '@/app/_components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { EmptyState } from '@/app/_components/ui/empty-state';
import { Field, FieldLabel } from '@/app/_components/ui/field';
import { PasswordField, SelectField, TextField, TextareaField } from '@/app/_components/ui/fields';
import { Pager } from '@/app/_components/ui/pager';
import { RadioGroupField } from '@/app/_components/ui/radio-group-field';
import { SearchField } from '@/app/_components/ui/search-field';
import { Switch } from '@/app/_components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/app/_components/ui/toggle-group';

interface ColumnRow {
  readonly name: string;
  readonly type: string;
}

afterEach(cleanup);

describe('form controls', () => {
  it('ties a text field to its label, hint and error for assistive tech', () => {
    renderUi(
      createElement(TextField, {
        error: 'Host is required',
        hint: 'Reachable from the execution network',
        label: 'Host',
        required: true,
      }),
    );

    const input = screen.getByRole('textbox', { name: /Host/ });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('required')).not.toBeNull();

    // The hint and the error are announced, not merely painted nearby.
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    const described = describedBy
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
      .join(' ');
    expect(described).toContain('Reachable from the execution network');
    expect(described).toContain('Host is required');
  });

  it('marks a dirty field so an unsaved edit is visible', () => {
    const { unmount } = renderUi(createElement(TextField, { label: 'Name' }));
    expect(screen.getByRole('textbox', { name: 'Name' }).className).not.toContain(
      'bg-status-warning',
    );
    unmount();

    renderUi(createElement(TextField, { dirty: true, label: 'Name' }));
    expect(screen.getByRole('textbox', { name: 'Name' }).className).toContain(
      'bg-status-warning-light/50',
    );
  });

  it('forwards typing from a text field', () => {
    const onChange = vi.fn();
    renderUi(createElement(TextField, { label: 'Port', onChange }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Port' }), { target: { value: '5432' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('hides a password by default and reveals it on request', () => {
    renderUi(createElement(PasswordField, { label: 'Password' }));

    expect(document.querySelector('input[type="password"]')).not.toBeNull();

    const toggle = screen.getByRole('button', { name: /toggle password visibility/iu });
    fireEvent.click(toggle);
    expect(document.querySelector('input[type="text"]')).not.toBeNull();

    fireEvent.click(toggle);
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
  });

  it('renders a textarea rather than a single-line field', () => {
    renderUi(createElement(TextareaField, { label: 'Description' }));

    expect(screen.getByRole('textbox', { name: 'Description' }).tagName).toBe('TEXTAREA');
  });

  it('lets a select choose an option by keyboard and reports the value', () => {
    const onChange = vi.fn();
    renderUi(
      createElement(SelectField, {
        data: [
          { label: 'require', value: 'require' },
          { label: 'disable', value: 'disable' },
        ],
        label: 'SSL mode',
        onChange,
        value: 'require',
      }),
    );

    const select = screen.getByLabelText('SSL mode');
    fireEvent.change(select, { target: { value: 'disable' } });
    expect(onChange).toHaveBeenCalledWith('disable');
  });

  it('renders a search field as a search box and clears it', () => {
    const onClear = vi.fn();
    renderUi(
      createElement(SearchField, {
        label: 'Search pipelines',
        onClear,
        value: 'ingest',
      }),
    );

    const input = screen.getByRole('searchbox', { name: 'Search pipelines' });
    expect(input.getAttribute('value')).toBe('ingest');

    fireEvent.click(screen.getByRole('button', { name: /clear/iu }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('hides the clear control while a search field is empty', () => {
    renderUi(createElement(SearchField, { label: 'Search nodes', onClear: vi.fn(), value: '' }));

    expect(screen.queryByRole('button', { name: /clear/iu })).toBeNull();
  });

  it('toggles a checkbox and a switch through their labels', () => {
    const onCheckedChange = vi.fn();
    const { unmount } = renderUi(
      createElement(
        Field,
        { orientation: 'horizontal' },
        createElement(Checkbox, { checked: false, id: 'archived', onCheckedChange }),
        createElement(FieldLabel, { htmlFor: 'archived', children: 'Archived' }),
      ),
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Archived' }));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    unmount();

    const onSwitch = vi.fn();
    renderUi(
      createElement(
        Field,
        { orientation: 'horizontal' },
        createElement(Switch, { checked: false, id: 'live-tail', onCheckedChange: onSwitch }),
        createElement(FieldLabel, { htmlFor: 'live-tail', children: 'Live tail' }),
      ),
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Live tail' }));
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it('groups radios so only one is selected and the group is named', () => {
    const onChange = vi.fn();
    renderUi(
      createElement(RadioGroupField, {
        data: [
          { label: 'Structured fields', value: 'structured' },
          { label: 'Connection URL', value: 'url' },
        ],
        label: 'Input mode',
        onChange,
        value: 'structured',
      }),
    );

    const group = screen.getByRole('radiogroup', { name: 'Input mode' });
    const structured = within(group).getByRole('radio', { name: 'Structured fields' });
    const url = within(group).getByRole('radio', { name: 'Connection URL' });
    expect(structured.getAttribute('aria-checked')).toBe('true');
    expect(url.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(url);
    expect(onChange).toHaveBeenCalledWith('url');
  });
});

describe('actions', () => {
  it('keeps a busy button out of reach and announces the state', () => {
    const onClick = vi.fn();
    renderUi(
      createElement(Button, {
        children: 'Save',
        disabled: true,
        onClick,
        'aria-busy': true,
      }),
    );

    const button = screen.getByRole('button', { name: /Save/ });
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a navigation action as a real link while keeping the button look', () => {
    renderUi(
      createElement(
        Button,
        { asChild: true },
        createElement('a', { href: '/pipelines/1' }, 'Flow canvas'),
      ),
    );

    const link = screen.getByRole('link', { name: 'Flow canvas' });
    expect(link.getAttribute('href')).toBe('/pipelines/1');
  });

  it('defaults to type=button so an action beside a submit does not submit', () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    renderUi(
      createElement(
        'form',
        { onSubmit },
        createElement(Button, { children: 'Cancel', onClick: vi.fn() }),
      ),
    );

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel.getAttribute('type')).toBe('button');
    fireEvent.click(cancel);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders a quiet text action as a real button, not an anchor', () => {
    const onClick = vi.fn();
    renderUi(createElement(Button, { children: 'Try again', onClick, variant: 'link' }));

    const button = screen.getByRole('button', { name: 'Try again' });
    expect(button.tagName).toBe('BUTTON');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('requires an accessible name on an icon-only button', () => {
    renderUi(
      createElement(Button, {
        children: '×',
        size: 'icon-sm',
        variant: 'ghost',
        'aria-label': 'Dismiss',
      }),
    );

    expect(screen.getByRole('button', { name: 'Dismiss' }).getAttribute('aria-label')).toBe(
      'Dismiss',
    );
  });
});

describe('overlays', () => {
  it('does not render a closed dialog and labels an open one', () => {
    const dialog = (open: boolean) =>
      createElement(
        Dialog,
        { open, onOpenChange: vi.fn() },
        createElement(
          DialogContent,
          null,
          createElement(DialogHeader, null, createElement(DialogTitle, null, 'Archive')),
          'body',
        ),
      );

    const { unmount } = renderUi(dialog(false));
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();

    renderUi(dialog(true));
    expect(screen.getByRole('dialog', { name: 'Archive' })).toBeTruthy();
  });

  it('closes a dialog on Escape', () => {
    const onOpenChange = vi.fn();
    renderUi(
      createElement(
        Dialog,
        { open: true, onOpenChange },
        createElement(
          DialogContent,
          null,
          createElement(DialogHeader, null, createElement(DialogTitle, null, 'Archive')),
          'body',
        ),
      ),
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('opens a menu and runs the chosen item', async () => {
    const onSelect = vi.fn();
    renderUi(
      createElement(
        DropdownMenu,
        null,
        createElement(
          DropdownMenuTrigger,
          { asChild: true },
          createElement(Button, { children: '⋯', 'aria-label': 'Row actions' }),
        ),
        createElement(
          DropdownMenuContent,
          null,
          createElement(DropdownMenuItem, { onSelect, children: 'Rename' }),
          createElement(DropdownMenuItem, { onSelect: vi.fn(), children: 'Archive' }),
        ),
      ),
    );

    // jsdom has no PointerEvent, so the trigger is opened the way a keyboard
    // user opens it — which is the path worth pinning anyway.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Row actions' }), { key: 'Enter' });

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('navigation and structure', () => {
  it('exposes a toggle group as one choice out of a known set', () => {
    const onValueChange = vi.fn();
    renderUi(
      createElement(
        ToggleGroup,
        { type: 'single', value: 'structured', onValueChange, 'aria-label': 'Input mode' },
        createElement(ToggleGroupItem, { value: 'structured', children: 'Structured fields' }),
        createElement(ToggleGroupItem, { value: 'url', children: 'Connection URL' }),
      ),
    );

    // A single-choice toggle group is a radio group, which is what it is.
    const group = screen.getByRole('radiogroup', { name: 'Input mode' });
    const structured = within(group).getByRole('radio', { name: 'Structured fields' });
    const url = within(group).getByRole('radio', { name: 'Connection URL' });
    expect(structured.getAttribute('aria-checked')).toBe('true');
    expect(url.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(url);
    expect(onValueChange).toHaveBeenCalledWith('url');
  });

  it('shows only the active tab panel', () => {
    const onValueChange = vi.fn();
    renderUi(
      createElement(
        Tabs,
        { value: 'overview', onValueChange },
        createElement(
          TabsList,
          { 'aria-label': 'Execution detail' },
          createElement(TabsTrigger, { value: 'overview', children: 'Overview' }),
          createElement(TabsTrigger, { value: 'logs', children: 'Logs' }),
        ),
        createElement(TabsContent, { value: 'overview', children: 'overview body' }),
        createElement(TabsContent, { value: 'logs', children: 'logs body' }),
      ),
    );

    expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByText('overview body')).toBeTruthy();
    expect(screen.queryByText('logs body')).toBeNull();

    // Radix activates a tab on mousedown, which is also what a real click sends.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Logs' }), { button: 0, ctrlKey: false });
    expect(onValueChange).toHaveBeenCalledWith('logs');
  });

  it('renders a data table with a header cell per column and a cell per row', () => {
    renderUi(
      createElement(DataTable<ColumnRow>, {
        columns: [
          { header: 'Column', key: 'name', render: (row) => row.name },
          { header: 'Type', key: 'type', render: (row) => row.type },
        ],
        rowKey: (row) => row.name,
        rows: [
          { name: 'id', type: 'bigint' },
          { name: 'email', type: 'text' },
        ],
      }),
    );

    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Column', 'Type']);
    expect(within(table).getAllByRole('row').length).toBe(3);
    expect(within(table).getByText('bigint')).toBeTruthy();
  });

  it('renders a data table empty message instead of a headerless void', () => {
    renderUi(
      createElement(DataTable<ColumnRow>, {
        columns: [{ header: 'Column', key: 'name', render: () => null }],
        emptyMessage: 'No columns',
        rowKey: (row) => row.name,
        rows: [],
      }),
    );

    expect(screen.getByText('No columns')).toBeTruthy();
  });

  it('marks the chosen selectable row as pressed', () => {
    const onSelect = vi.fn();
    renderUi(
      createElement(Button, {
        children: 'analytics-primary',
        onClick: onSelect,
        variant: 'ghost',
        'aria-pressed': true,
      }),
    );

    const row = screen.getByRole('button', { name: 'analytics-primary' });
    expect(row.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders an empty state with its mark hidden from assistive tech', () => {
    renderUi(
      createElement(EmptyState, {
        action: createElement(Button, { children: 'New connection' }),
        description: 'Register one to get started.',
        mark: '+',
        title: 'No connections yet',
      }),
    );

    expect(screen.getByRole('heading', { name: 'No connections yet' })).toBeTruthy();
    expect(screen.getByText('Register one to get started.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New connection' })).toBeTruthy();
    expect(document.querySelector('[aria-hidden="true"]')?.textContent).toBe('+');
  });

  it('moves between pages and reports the current one', () => {
    const onChange = vi.fn();
    renderUi(createElement(Pager, { onChange, page: 2, total: 5 }));

    const nav = screen.getByRole('navigation');
    expect(nav.getAttribute('aria-label')).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe(
      'page',
    );

    fireEvent.click(within(nav).getByRole('button', { name: /next/iu }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('hides the pager when there is only one page', () => {
    renderUi(createElement(Pager, { onChange: vi.fn(), page: 1, total: 1 }));

    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

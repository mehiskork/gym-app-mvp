jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return {
    ...actual,
    useState: jest.fn(),
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  return {
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('View', props, children),
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Text', props, children),
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('Pressable', props, children),
    ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('ScrollView', props, children),
    StyleSheet: {
      create: (styles: unknown) => styles,
      hairlineWidth: 1,
    },
    Platform: { select: () => 'monospace' },
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('SafeAreaView', props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: ({ name, ...props }: { name: string }) =>
      React.createElement('Ionicons', { name, ...props }),
  };
});

jest.mock('../../db/prebuiltPlansRepo', () => ({
  getPrebuiltPlanPreview: jest.fn(),
  importPrebuiltPlan: jest.fn(),
}));

jest.mock('../../db/workoutSessionRepo', () => ({
  getInProgressSession: jest.fn(),
}));

import React from 'react';

import { Button, EmptyState } from '../../ui';
import { PrebuiltPlanPreviewScreen } from '../PrebuiltPlanPreviewScreen';
import {
  getPrebuiltPlanPreview,
  importPrebuiltPlan,
  type PrebuiltPlanPreview,
} from '../../db/prebuiltPlansRepo';
import { getInProgressSession } from '../../db/workoutSessionRepo';

type Nav = {
  replace: jest.Mock;
};

const preview: PrebuiltPlanPreview = {
  templateId: 'tpl-1',
  name: 'V-Taper Project',
  description: 'Upper body plan',
  sessionCount: 2,
  existingPlanId: null,
  sessions: [
    {
      id: 'tpl-1:day:1',
      name: 'Session 1',
      exercises: [
        { id: 'ex-1', name: 'Barbell Bench Press' },
        { id: 'ex-2', name: 'Pull-Up' },
      ],
    },
    {
      id: 'tpl-1:day:2',
      name: 'Session 2',
      exercises: [{ id: 'ex-3', name: 'Lat Pulldown' }],
    },
  ],
};

function findElementsByType<P>(
  node: React.ReactNode,
  type: React.ElementType,
  acc: Array<React.ReactElement<P>> = [],
): Array<React.ReactElement<P>> {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach((child) => findElementsByType<P>(child, type, acc));
    return acc;
  }
  if (React.isValidElement<React.PropsWithChildren<P>>(node)) {
    if (node.type === type) acc.push(node as React.ReactElement<P>);
    return findElementsByType<P>(node.props.children, type, acc);
  }
  return acc;
}

function textContent(node: React.ReactNode): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (React.isValidElement(node)) {
    return textContent((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

function renderScreen(templateId = 'tpl-1', navigation: Nav = { replace: jest.fn() }) {
  return PrebuiltPlanPreviewScreen({
    navigation,
    route: {
      key: 'PrebuiltPlanPreview',
      name: 'PrebuiltPlanPreview',
      params: { templateId },
    },
  } as never);
}

describe('PrebuiltPlanPreviewScreen', () => {
  const useStateMock = React.useState as jest.Mock;

  beforeEach(() => {
    useStateMock.mockReset();
    useStateMock.mockImplementation((initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      jest.fn(),
    ]);
    (getPrebuiltPlanPreview as jest.Mock).mockReset();
    (getPrebuiltPlanPreview as jest.Mock).mockReturnValue(preview);
    (importPrebuiltPlan as jest.Mock).mockReset();
    (importPrebuiltPlan as jest.Mock).mockReturnValue('plan-1');
    (getInProgressSession as jest.Mock).mockReset();
    (getInProgressSession as jest.Mock).mockReturnValue(null);
  });

  it('renders the selected plan overview, sessions, and exercise names without prescriptions', () => {
    const element = renderScreen();
    const text = textContent(element);

    expect(text).toContain('V-Taper Project');
    expect(text).toContain('Upper body plan');
    expect(text).toContain('2 sessions');
    expect(text).toContain('Session 1');
    expect(text).toContain('Session 2');
    expect(text).toContain('Barbell Bench Press');
    expect(text).toContain('Pull-Up');
    expect(text).toContain('Lat Pulldown');
    expect(text).not.toContain('reps');
    expect(text).not.toContain('rest');
    expect(text).not.toContain('seconds');
  });

  it('does not import during render or load', () => {
    renderScreen();

    expect(getPrebuiltPlanPreview).toHaveBeenCalledWith('tpl-1');
    expect(importPrebuiltPlan).not.toHaveBeenCalled();
  });

  it('imports through the existing import path and follows list import navigation', () => {
    const navigation: Nav = { replace: jest.fn() };
    const element = renderScreen('tpl-1', navigation);

    type ButtonProps = React.ComponentProps<typeof Button>;
    const addButton = findElementsByType<ButtonProps>(element, Button).find(
      (button) => button.props.title === 'Add to my plans',
    );
    addButton?.props.onPress?.({} as never);

    expect(importPrebuiltPlan).toHaveBeenCalledWith('tpl-1');
    expect(navigation.replace).toHaveBeenCalledWith('WorkoutPlanDetail', {
      workoutPlanId: 'plan-1',
      mode: 'pickSessionToStart',
    });
  });

  it('does not navigate after preview import when there is an active session', () => {
    (getInProgressSession as jest.Mock).mockReturnValue({ id: 'session-1' });
    const navigation: Nav = { replace: jest.fn() };
    const element = renderScreen('tpl-1', navigation);

    type ButtonProps = React.ComponentProps<typeof Button>;
    const addButton = findElementsByType<ButtonProps>(element, Button).find(
      (button) => button.props.title === 'Add to my plans',
    );
    addButton?.props.onPress?.({} as never);

    expect(importPrebuiltPlan).toHaveBeenCalledWith('tpl-1');
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('disables the CTA for an already imported template and does not import again', () => {
    (getPrebuiltPlanPreview as jest.Mock).mockReturnValue({
      ...preview,
      existingPlanId: 'plan-existing',
    });
    const element = renderScreen();

    type ButtonProps = React.ComponentProps<typeof Button>;
    const addedButton = findElementsByType<ButtonProps>(element, Button).find(
      (button) => button.props.title === 'Added to plans',
    );

    expect(addedButton?.props.disabled).toBe(true);
    addedButton?.props.onPress?.({} as never);
    expect(importPrebuiltPlan).not.toHaveBeenCalled();
  });

  it('shows a safe fallback for an invalid template and does not import', () => {
    (getPrebuiltPlanPreview as jest.Mock).mockReturnValue(null);
    const element = renderScreen('missing-template');

    type EmptyStateProps = React.ComponentProps<typeof EmptyState>;
    const emptyState = findElementsByType<EmptyStateProps>(element, EmptyState)[0];

    expect(emptyState?.props.title).toBe('Plan not found');
    expect(importPrebuiltPlan).not.toHaveBeenCalled();
  });
});

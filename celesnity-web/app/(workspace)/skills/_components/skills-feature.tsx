'use client';

import { getInjection } from '@/di/container';

import { SkillsScreen } from './skills-screen';

const controllers = Object.freeze({
  list: getInjection('ListSkillsController'),
  get: getInjection('GetSkillController'),
  create: getInjection('CreateSkillController'),
  update: getInjection('UpdateSkillController'),
  delete: getInjection('DeleteSkillController'),
});

export function SkillsFeature() {
  return <SkillsScreen controllers={controllers} />;
}

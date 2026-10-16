import { validate } from 'class-validator';

import {
  UpdateAuthorizationGroupFeaturesDto,
  UpdateMembershipDto,
} from '@presentation/administration/administration.dto';

describe('UpdateMembershipDto', () => {
  it.each(['ACTIVE', 'REVOKED'])('accepts the supported membership status %s', async (status) => {
    const dto = Object.assign(new UpdateMembershipDto(), { role: 'VIEWER', status });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects the removed SUSPENDED membership status', async () => {
    const dto = Object.assign(new UpdateMembershipDto(), { role: 'VIEWER', status: 'SUSPENDED' });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('status');
  });
});

describe('UpdateAuthorizationGroupFeaturesDto', () => {
  it('accepts an explicitly empty feature policy', async () => {
    const dto = Object.assign(new UpdateAuthorizationGroupFeaturesDto(), { visibleFeatures: [] });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects unknown and duplicate feature keys', async () => {
    const dto = Object.assign(new UpdateAuthorizationGroupFeaturesDto(), {
      visibleFeatures: ['HOME', 'HOME', 'UNKNOWN'],
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('visibleFeatures');
  });
});

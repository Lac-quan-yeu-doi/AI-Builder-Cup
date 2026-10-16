import { AgentManifestOrganizationInventory } from '@application/administration/agent-manifest-organizations';

describe('Agent manifest organization inventory', () => {
  const bindings = [
    { organizationId: 'celesnity', identityTenantId: 'tenant-a' },
    { organizationId: 'kasa', identityTenantId: 'tenant-b' },
  ];

  it('returns every active binding and audits each without creating grants', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    const service = new AgentManifestOrganizationInventory({ listActive: async () => bindings }, { write });
    await expect(service.list('verified-agent@example.test', 'request-1')).resolves.toEqual(bindings);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'kasa', requestId: 'request-1', metadata: { workload: 'verified-agent@example.test' } }));
  });

  it('fails closed when audit persistence fails', async () => {
    const service = new AgentManifestOrganizationInventory({ listActive: async () => bindings }, { write: async () => { throw new Error('audit unavailable'); } });
    await expect(service.list('agent')).rejects.toThrow('audit unavailable');
  });
});

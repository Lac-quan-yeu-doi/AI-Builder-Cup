import { validateEnvironment } from '@infrastructure/configuration/environment';

describe('minder-agent environment', () => {
  it('normalizes configured and default agent URLs to the API base path', () => {
    expect(validateEnvironment({ MINDER_AGENT_URL: 'http://agent:8080' })).toMatchObject({
      MINDER_AGENT_URL: 'http://agent:8080/api/v2',
    });
    expect(validateEnvironment({ MINDER_AGENT_URL: 'http://agent:8080/api/v1/' })).toMatchObject({
      MINDER_AGENT_URL: 'http://agent:8080/api/v2',
    });
    expect(validateEnvironment({})).toMatchObject({
      MINDER_AGENT_URL: 'http://minder-agent.internal/api/v2',
    });
  });
});

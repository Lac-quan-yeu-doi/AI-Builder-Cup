const readinessPrisma = {
  $queryRaw: jest.fn(),
  organization: { findMany: jest.fn() },
  $disconnect: jest.fn(),
};

jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: jest.fn() }));
jest.mock('@generated/prisma/client', () => ({
  PrismaClient: jest.fn(() => readinessPrisma),
}));

const originalPhase = process.env.AUTHORIZATION_READINESS_PHASE;
const originalDatabase = process.env.DATABASE_URL;
const originalExitCode = process.exitCode;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.AUTHORIZATION_READINESS_PHASE = 'pre-migration';
  process.env.DATABASE_URL = 'postgresql://fixture';
  process.exitCode = 0;
  readinessPrisma.$disconnect.mockResolvedValue(undefined);
});
afterEach(() => {
  if (originalPhase === undefined) delete process.env.AUTHORIZATION_READINESS_PHASE;
  else process.env.AUTHORIZATION_READINESS_PHASE = originalPhase;
  if (originalDatabase === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabase;
  process.exitCode = originalExitCode;
  jest.restoreAllMocks();
});

async function runPreflight(): Promise<void> {
  await import('../../bootstrap/authorization-readiness-main');
  await new Promise<void>((resolve) => setImmediate(resolve));
}

it('defers only a fresh schema to the post-migration readiness check', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  readinessPrisma.$queryRaw.mockResolvedValue([{ organizations: null }]);
  await runPreflight();
  expect(log).toHaveBeenCalledWith(
    'Fresh database: authorization will be checked after bootstrap.',
  );
  expect(readinessPrisma.organization.findMany).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(0);
  expect(readinessPrisma.$disconnect).toHaveBeenCalled();
});

it('blocks a populated tenant missing its background identity before migrations', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  readinessPrisma.$queryRaw.mockResolvedValue([{ organizations: 'celesnity_app.organizations' }]);
  readinessPrisma.organization.findMany.mockResolvedValue([
    {
      id: 'organization',
      slug: 'saigonfood',
      memberships: [{ id: 'owner' }],
      serviceIdentities: [],
    },
  ]);
  await runPreflight();
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining('UNUSABLE_BACKGROUND_IDENTITY (saigonfood)'),
  );
  expect(process.exitCode).toBe(1);
  expect(readinessPrisma.$disconnect).toHaveBeenCalled();
});

it('keeps driver errors redacted and fails closed', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  readinessPrisma.$queryRaw.mockRejectedValue(new Error('fixture-secret-connection'));
  await runPreflight();
  expect(error).toHaveBeenCalledWith('Authorization readiness failed; rollout must remain closed.');
  expect(process.exitCode).toBe(1);
  expect(readinessPrisma.organization.findMany).not.toHaveBeenCalled();
});

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MetadataCrawlerListQueryDto } from '@presentation/metadata-crawler/metadata-crawler.dto';

describe('MetadataCrawlerListQueryDto', () => {
  it.each([
    ['true', true],
    ['false', false],
  ] as const)('parses includeArchived=%s from an HTTP query', async (value, expected) => {
    const query = plainToInstance(MetadataCrawlerListQueryDto, { includeArchived: value });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query.includeArchived).toBe(expected);
  });

  it('keeps the default when includeArchived is omitted', async () => {
    const query = plainToInstance(MetadataCrawlerListQueryDto, {});

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query.includeArchived).toBe(false);
  });

  it('rejects values other than true or false', async () => {
    const query = plainToInstance(MetadataCrawlerListQueryDto, { includeArchived: 'yes' });

    await expect(validate(query)).resolves.not.toHaveLength(0);
  });
});

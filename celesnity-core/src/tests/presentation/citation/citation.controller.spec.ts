import { CitationController } from '@presentation/citation/citation.controller';
import type { CitationUseCases } from '@application/citation/citation.use-cases';
import type { ResolveCitationsDto } from '@presentation/citation/citation.dto';

describe('CitationController', () => {
  it('resolves the DTO citations and maps the result to snake_case response fields', async () => {
    const useCases = {
      resolve: jest.fn(async () => [
        { type: 'chart', id: 'chart-1', found: true, title: 'Revenue by month' },
      ]),
    } as unknown as CitationUseCases;
    const controller = new CitationController(useCases);
    const dto: ResolveCitationsDto = { citations: [{ type: 'chart', id: 'chart-1' }] };

    const result = await controller.resolve(dto);

    expect(useCases.resolve).toHaveBeenCalledWith(dto.citations);
    expect(result).toEqual([
      { type: 'chart', id: 'chart-1', found: true, title: 'Revenue by month', page: undefined },
    ]);
  });
});

import { Module } from '@nestjs/common';

import { ChartUseCases } from '@application/chart/chart.use-cases';
import { CitationUseCases } from '@application/citation/citation.use-cases';
import { ChartModule } from '@modules/chart.module';
import { CitationController } from '@presentation/citation/citation.controller';

@Module({
  imports: [ChartModule],
  controllers: [CitationController],
  providers: [
    {
      provide: CitationUseCases,
      inject: [ChartUseCases],
      useFactory: (chartUseCases: ChartUseCases): CitationUseCases =>
        new CitationUseCases(chartUseCases),
    },
  ],
})
export class CitationModule {}

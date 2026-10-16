import { Module } from '@nestjs/common';

import { ChartUseCases } from '@application/chart/chart.use-cases';
import { CitationUseCases } from '@application/citation/citation.use-cases';
import { DocumentUseCases } from '@application/document/document.use-cases';
import { ChartModule } from '@modules/chart.module';
import { DocumentModule } from '@modules/document.module';
import { CitationController } from '@presentation/citation/citation.controller';

@Module({
  imports: [ChartModule, DocumentModule],
  controllers: [CitationController],
  providers: [
    {
      provide: CitationUseCases,
      inject: [ChartUseCases, DocumentUseCases],
      useFactory: (
        chartUseCases: ChartUseCases,
        documentUseCases: DocumentUseCases,
      ): CitationUseCases => new CitationUseCases(chartUseCases, documentUseCases),
    },
  ],
})
export class CitationModule {}

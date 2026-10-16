import { Module } from '@nestjs/common';

import {
  TUTORIAL_CONTEXT_READER,
  type TutorialContextReader,
} from '@application/tutorial/tutorial-context.reader';
import {
  TUTORIAL_PROGRESS_REPOSITORY,
  TUTORIAL_REPOSITORY,
  type TutorialProgressRepository,
  type TutorialRepository,
} from '@application/tutorial/tutorial.repository';
import { TutorialUseCases } from '@application/tutorial/tutorial.use-cases';
import { PrismaTutorialContextReader } from '@infrastructure/prisma/tutorial/prisma-tutorial-context.reader';
import { PrismaTutorialProgressRepository } from '@infrastructure/prisma/tutorial/prisma-tutorial-progress.repository';
import { PrismaTutorialRepository } from '@infrastructure/prisma/tutorial/prisma-tutorial.repository';
import { TutorialController } from '@presentation/tutorial/tutorial.controller';

@Module({
  controllers: [TutorialController],
  providers: [
    PrismaTutorialRepository,
    PrismaTutorialProgressRepository,
    PrismaTutorialContextReader,
    { provide: TUTORIAL_REPOSITORY, useExisting: PrismaTutorialRepository },
    { provide: TUTORIAL_PROGRESS_REPOSITORY, useExisting: PrismaTutorialProgressRepository },
    { provide: TUTORIAL_CONTEXT_READER, useExisting: PrismaTutorialContextReader },
    {
      provide: TutorialUseCases,
      inject: [TUTORIAL_REPOSITORY, TUTORIAL_PROGRESS_REPOSITORY, TUTORIAL_CONTEXT_READER],
      useFactory: (
        tutorials: TutorialRepository,
        progress: TutorialProgressRepository,
        contexts: TutorialContextReader,
      ): TutorialUseCases => new TutorialUseCases(tutorials, progress, contexts),
    },
  ],
})
export class TutorialModule {}

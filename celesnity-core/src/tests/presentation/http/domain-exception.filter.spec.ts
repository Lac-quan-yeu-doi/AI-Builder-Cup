import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Body,
} from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsInt, IsString } from 'class-validator';
import type { Server } from 'node:http';
import * as request from 'supertest';

import { ConnectionError } from '@domain/database-service/errors/connection.errors';
import { DomainExceptionFilter } from '@presentation/http/domain-exception.filter';
import { ProblemDetailsFilter } from '@presentation/http/problem-details.filter';
import { requestValidationException } from '@presentation/http/request-validation.exception';

/**
 * Covers the two behaviours the filter must not regress, both inherited from the
 * per-controller mappers it replaced:
 *
 *  1. An error with no mapping becomes a generic 500 that leaks nothing.
 *  2. Exceptions NestJS raises itself pass through with their own status. That
 *     includes the 400s class-validator produces through the global
 *     ValidationPipe, which is why this specification wires a real pipe and DTO
 *     rather than asserting on the filter in isolation.
 */

class SampleDto {
  @IsString()
  public readonly name!: string;

  @IsInt()
  public readonly count!: number;
}

@Controller('probe')
class ProbeController {
  @Get('mapped')
  public mapped(): never {
    throw ConnectionError.notFound();
  }

  @Get('unmapped')
  public unmapped(): never {
    throw new Error('postgresql://alice:s3cr3t@db.internal/analytics failed');
  }

  @Get('nest-exception')
  public nestException(): never {
    throw new BadRequestException('explicitly raised');
  }

  @Get('teapot')
  public teapot(): never {
    throw new HttpException('short and stout', HttpStatus.I_AM_A_TEAPOT);
  }

  @Get('thrown-string')
  public thrownString(): never {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw 'a bare string';
  }

  @Post('validated')
  public validated(@Body() body: SampleDto): SampleDto {
    return body;
  }
}

interface ErrorBody {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details: unknown;
  };
  readonly meta: { readonly requestId: string; readonly timestamp: string };
}

describe('DomainExceptionFilter', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  async function buildApp(): ReturnType<typeof create> {
    return create();
  }

  async function create(): Promise<{
    readonly server: Server;
    readonly close: () => Promise<void>;
  }> {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();

    const instance = moduleRef.createNestApplication({ logger: false });
    instance.useGlobalPipes(
      new ValidationPipe({
        exceptionFactory: requestValidationException,
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );
    instance.useGlobalFilters(new DomainExceptionFilter(new ProblemDetailsFilter()));
    await instance.init();

    return {
      server: instance.getHttpServer() as Server,
      close: async (): Promise<void> => {
        await instance.close();
      },
    };
  }

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('translates a domain error and retains its stable API code', async () => {
    const response = await request(app.server).get('/probe/mapped');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body as ErrorBody).toMatchObject({
      success: false,
      error: {
        code: 'CONNECTION_NOT_FOUND',
        message: 'The connection was not found.',
        details: null,
      },
    });
    expect((response.body as ErrorBody).meta.timestamp).toEqual(expect.any(String));
  });

  describe('an unmapped error', () => {
    it('becomes a generic 500', async () => {
      const response = await request(app.server).get('/probe/unmapped');

      expect(response.status).toBe(500);
      expect(response.body as ErrorBody).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
          details: null,
        },
      });
    });

    it('leaks neither the message nor the credentials inside it', async () => {
      const response = await request(app.server).get('/probe/unmapped');
      const serialized = JSON.stringify(response.body);

      expect(serialized).not.toContain('s3cr3t');
      expect(serialized).not.toContain('db.internal');
      expect(serialized).not.toContain('failed');
    });
  });

  it('handles a thrown non-Error value as a generic 500', async () => {
    const response = await request(app.server).get('/probe/thrown-string');

    expect(response.status).toBe(500);
    expect((response.body as ErrorBody).error.message).toBe('An unexpected error occurred.');
  });

  describe('NestJS exceptions pass through untouched', () => {
    it('keeps an explicitly raised BadRequestException', async () => {
      const response = await request(app.server).get('/probe/nest-exception');

      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).error).toMatchObject({
        code: 'INVALID_REQUEST',
        message: 'explicitly raised',
      });
    });

    it('keeps a status the registry knows nothing about', async () => {
      const response = await request(app.server).get('/probe/teapot');

      expect(response.status).toBe(HttpStatus.I_AM_A_TEAPOT);
      expect((response.body as ErrorBody).error).toMatchObject({
        code: 'REQUEST_FAILED',
        message: 'short and stout',
      });
    });

    it('maps class-validator failures to structured 422 field details', async () => {
      const response = await request(app.server).post('/probe/validated').send({ name: 5 });

      expect(response.status).toBe(422);
      expect((response.body as ErrorBody).error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'The request contains invalid fields.',
        details: {
          fields: expect.arrayContaining([
            expect.objectContaining({ field: 'name', code: 'INVALID_TYPE' }),
            expect.objectContaining({ field: 'count', code: 'REQUIRED' }),
          ]) as unknown,
        },
      });
    });

    it('returns 422 for a rejected unknown property', async () => {
      const response = await request(app.server)
        .post('/probe/validated')
        .send({ name: 'x', count: 1, extra: true });

      expect(response.status).toBe(422);
    });

    it('lets a valid request through', async () => {
      const response = await request(app.server).post('/probe/validated').send({
        name: 'x',
        count: 1,
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ name: 'x', count: 1 });
    });
  });
});

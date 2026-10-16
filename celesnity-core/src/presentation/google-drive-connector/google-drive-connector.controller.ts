import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { GoogleDriveConnectorService } from '@application/google-drive-connector/google-drive-connector.service';
import { requireAuthenticatedPrincipal } from '@presentation/http/authenticated-request';
import { Public } from '@presentation/http/public.decorator';
import {
  GoogleDriveFileResponseDto,
  GoogleDriveStatusResponseDto,
} from './google-drive-connector.response';

@ApiTags('google-drive-connector')
@Controller('google-drive-connector')
export class GoogleDriveConnectorController {
  public constructor(private readonly service: GoogleDriveConnectorService) {}

  @Get('oauth/authorize')
  @ApiOperation({ summary: 'Redirect to Google OAuth consent screen for Drive access' })
  public authorize(@Req() request: Request, @Res() res: Response): void {
    const principal = requireAuthenticatedPrincipal(request);
    res.redirect(this.service.getAuthUrl(principal.identityId));
  }

  @Get('oauth/callback')
  @Public()
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  public async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      res.status(400).json({ code: 'OAUTH_DENIED', message: `Google OAuth error: ${error}` });
      return;
    }
    if (!code || !state) {
      res.status(400).json({ code: 'MISSING_PARAMS', message: 'code and state are required' });
      return;
    }
    const outcome = await this.service.handleCallback(state, code);
    if (outcome === 'invalid_state') {
      res.status(400).json({ code: 'INVALID_STATE', message: 'OAuth state is invalid or expired' });
      return;
    }
    res.json({ status: 'connected' });
  }

  @Get('status')
  @ApiOperation({ summary: 'Check Google Drive connection status' })
  @ApiOkResponse({ type: GoogleDriveStatusResponseDto })
  public async status(@Req() request: Request): Promise<GoogleDriveStatusResponseDto> {
    const principal = requireAuthenticatedPrincipal(request);
    return GoogleDriveStatusResponseDto.from(await this.service.status(principal.identityId));
  }

  @Get('files')
  @ApiOperation({ summary: 'List files from connected Google Drive' })
  @ApiOkResponse({ type: [GoogleDriveFileResponseDto] })
  public async listFiles(
    @Req() request: Request,
    @Query('q') query?: string,
  ): Promise<readonly GoogleDriveFileResponseDto[]> {
    const principal = requireAuthenticatedPrincipal(request);
    const files = await this.service.listFiles(principal.identityId, query);
    return files.map((file) => GoogleDriveFileResponseDto.from(file));
  }

  @Delete('connection')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disconnect Google Drive' })
  @ApiNoContentResponse()
  public async disconnect(@Req() request: Request): Promise<void> {
    const principal = requireAuthenticatedPrincipal(request);
    await this.service.disconnect(principal.identityId);
  }
}

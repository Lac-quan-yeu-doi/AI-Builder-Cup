import { ApiProperty } from '@nestjs/swagger';

import type { ResolvedCitation } from '@application/citation/citation.use-cases';

export class ResolvedCitationResponse {
  @ApiProperty({ enum: ['chart', 'document'] })
  public readonly type: string;

  @ApiProperty()
  public readonly id: string;

  @ApiProperty()
  public readonly found: boolean;

  @ApiProperty({ nullable: true, type: String })
  public readonly title: string | null;

  @ApiProperty({ required: false })
  public readonly page?: number;

  private constructor(citation: ResolvedCitation) {
    this.type = citation.type;
    this.id = citation.id;
    this.found = citation.found;
    this.title = citation.title;
    this.page = citation.page;
  }

  public static from(citation: ResolvedCitation): ResolvedCitationResponse {
    return new ResolvedCitationResponse(citation);
  }

  public static fromList(
    citations: readonly ResolvedCitation[],
  ): readonly ResolvedCitationResponse[] {
    return citations.map((c) => ResolvedCitationResponse.from(c));
  }
}

import type { SkillName, SkillDefinition } from "@domain/index.js";
import type { SkillPort } from "@application/shared/ports/index.js";
import type { PrismaService } from "../prisma.service.js";
import { skillFromRow } from "../mappers/repositories.js";

export class PrismaSkillStore implements SkillPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly owner: string,
  ) {}

  async create(skill: SkillDefinition): Promise<boolean> {
    const result = await this.prisma.skill.createMany({
      data: [
        {
          owner: this.owner,
          name: skill.name,
          namespace: skill.namespace,
          description: skill.description ?? null,
          body: skill.body,
          hash: skill.hash,
          source: skill.source,
          readOnly: skill.readOnly,
          createdAt: new Date(skill.createdAt),
          updatedAt: new Date(skill.updatedAt),
        },
      ],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  async delete(name: SkillName): Promise<void> {
    await this.prisma.skill.deleteMany({ where: { owner: this.owner, name } });
  }

  async get(name: SkillName) {
    const row = await this.prisma.skill.findFirst({
      where: { owner: this.owner, name },
    });
    return row ? skillFromRow(row) : undefined;
  }

  async list() {
    const rows = await this.prisma.skill.findMany({
      where: { owner: this.owner },
      orderBy: { name: "asc" },
    });
    return rows.map(skillFromRow);
  }

  async save(skill: SkillDefinition): Promise<void> {
    await this.prisma.skill.upsert({
      where: { owner_name: { owner: this.owner, name: skill.name } },
      create: {
        owner: this.owner,
        name: skill.name,
        namespace: skill.namespace,
        description: skill.description ?? null,
        body: skill.body,
        hash: skill.hash,
        source: skill.source,
        readOnly: skill.readOnly,
        createdAt: new Date(skill.createdAt),
        updatedAt: new Date(skill.updatedAt),
      },
      update: {
        namespace: skill.namespace,
        description: skill.description ?? null,
        body: skill.body,
        hash: skill.hash,
        source: skill.source,
        readOnly: skill.readOnly,
        updatedAt: new Date(skill.updatedAt),
      },
    });
  }
}

import type { Prisma } from '@generated/prisma/client';

import { NodeCatalogError } from '@domain/node-catalog/errors/node-catalog.errors';
import {
  NODE_CATEGORIES,
  NODE_PROPERTY_COMPONENTS,
  type NodeCategory,
  type NodeDefinition,
  type NodePortDefinition,
  type NodePropertyComponent,
  type NodePropertyField,
  type NodePropertyOption,
  type NodePropertySection,
} from '@domain/node-catalog/models/node-definition';

export const NODE_DEFINITION_SELECTION = {
  type: true,
  category: true,
  label: true,
  description: true,
  iconKey: true,
  enabled: true,
  runtimeKind: true,
  inputPorts: true,
  outputPorts: true,
  propertyPanel: true,
} as const;

export type NodeDefinitionRecord = Prisma.NodeDefinitionGetPayload<{
  select: typeof NODE_DEFINITION_SELECTION;
}>;

export class NodeDefinitionMapper {
  public toDomain(record: NodeDefinitionRecord): NodeDefinition {
    return {
      resourceId: `definition:${record.type}`,
      type: record.type,
      category: this.category(record.category),
      label: record.label,
      description: record.description,
      iconKey: record.iconKey,
      enabled: record.enabled,
      runtimeKind: this.runtimeKind(record.runtimeKind),
      inputPorts: this.ports(record.inputPorts),
      outputPorts: this.ports(record.outputPorts),
      propertyPanel: this.propertyPanel(record.propertyPanel),
    };
  }

  private category(value: string): NodeCategory {
    if (!NODE_CATEGORIES.some((category) => category === value)) {
      throw NodeCatalogError.invalidConfiguration();
    }
    return value as NodeCategory;
  }

  private runtimeKind(value: string): 'SPARK_DATAFRAME' {
    if (value !== 'SPARK_DATAFRAME') {
      throw NodeCatalogError.invalidConfiguration();
    }
    return value;
  }

  private ports(value: Prisma.JsonValue): readonly NodePortDefinition[] {
    return this.array(value).map((item) => {
      const record = this.record(item);
      const dataType = this.string(record.dataType);
      const required = this.boolean(record.required);
      const maxConnections = record.maxConnections;
      if (
        dataType !== 'DATASET' ||
        !(
          maxConnections === null ||
          (typeof maxConnections === 'number' &&
            Number.isInteger(maxConnections) &&
            maxConnections >= 1)
        )
      ) {
        throw NodeCatalogError.invalidConfiguration();
      }
      return {
        id: this.string(record.id),
        label: this.string(record.label),
        dataType,
        required,
        maxConnections,
      };
    });
  }

  private propertyPanel(value: Prisma.JsonValue): NodeDefinition['propertyPanel'] {
    const record = this.record(value);
    return {
      sections: this.array(record.sections).map((section) => this.section(section)),
    };
  }

  private section(value: Prisma.JsonValue): NodePropertySection {
    const record = this.record(value);
    return {
      id: this.string(record.id),
      title: this.string(record.title),
      fields: this.array(record.fields).map((field) => this.field(field)),
    };
  }

  private field(value: Prisma.JsonValue): NodePropertyField {
    const record = this.record(value);
    const component = this.string(record.component);
    if (!NODE_PROPERTY_COMPONENTS.some((value) => value === component)) {
      throw NodeCatalogError.invalidConfiguration();
    }
    const field: NodePropertyField = {
      key: this.string(record.key),
      label: this.string(record.label),
      component: component as NodePropertyComponent,
      required: this.boolean(record.required),
    };
    return {
      ...field,
      ...(record.description === undefined ? {} : { description: this.string(record.description) }),
      ...(record.defaultValue === undefined ? {} : { defaultValue: record.defaultValue }),
      ...(record.dependsOn === undefined
        ? {}
        : { dependsOn: this.array(record.dependsOn).map((item) => this.string(item)) }),
      ...(record.visibleWhen === undefined
        ? {}
        : {
            visibleWhen: {
              field: this.string(this.record(record.visibleWhen).field),
              equals: this.record(record.visibleWhen).equals,
            },
          }),
      ...(record.options === undefined
        ? {}
        : { options: this.array(record.options).map((option) => this.option(option)) }),
    };
  }

  private option(value: Prisma.JsonValue): NodePropertyOption {
    const record = this.record(value);
    return { label: this.string(record.label), value: this.string(record.value) };
  }

  private record(
    value: Prisma.JsonValue | undefined,
  ): Readonly<Record<string, Prisma.JsonValue | undefined>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw NodeCatalogError.invalidConfiguration();
    }
    return value;
  }

  private array(value: Prisma.JsonValue | undefined): readonly Prisma.JsonValue[] {
    if (!Array.isArray(value)) {
      throw NodeCatalogError.invalidConfiguration();
    }
    return value;
  }

  private string(value: Prisma.JsonValue | undefined): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw NodeCatalogError.invalidConfiguration();
    }
    return value;
  }

  private boolean(value: Prisma.JsonValue | undefined): boolean {
    if (typeof value !== 'boolean') {
      throw NodeCatalogError.invalidConfiguration();
    }
    return value;
  }
}

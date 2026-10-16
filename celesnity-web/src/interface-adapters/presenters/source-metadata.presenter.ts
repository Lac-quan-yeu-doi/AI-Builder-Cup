import type {
  SourceColumn,
  SourceConstraint,
  SourceMetadataPage,
  SourceMetadataSnapshotSummary,
  SourceNamespace,
  SourceRelation,
} from '@/src/entities/models/source-metadata';

export function presentSourceMetadataSummary(
  summary: SourceMetadataSnapshotSummary,
): SourceMetadataSnapshotSummary {
  return { ...summary };
}

export function presentSourceNamespacePage(page: SourceMetadataPage<SourceNamespace>) {
  return {
    ...page,
    items: page.items.map((item) => ({ ...item })),
    pagination: { ...page.pagination },
    sort: { ...page.sort },
  };
}

export function presentSourceRelationPage(page: SourceMetadataPage<SourceRelation>) {
  return {
    ...page,
    items: page.items.map(presentSourceRelation),
    pagination: { ...page.pagination },
    sort: { ...page.sort },
  };
}

export function presentSourceRelation(relation: SourceRelation): SourceRelation {
  return { ...relation, properties: { ...relation.properties } };
}

export function presentSourceColumnPage(page: SourceMetadataPage<SourceColumn>) {
  return {
    ...page,
    items: page.items.map((item) => ({ ...item, properties: { ...item.properties } })),
    pagination: { ...page.pagination },
    sort: { ...page.sort },
  };
}

export function presentSourceConstraints(
  constraints: readonly SourceConstraint[],
): readonly SourceConstraint[] {
  return constraints.map((constraint) => ({
    ...constraint,
    columns: constraint.columns.map((column) => ({ ...column })),
    properties: { ...constraint.properties },
  }));
}

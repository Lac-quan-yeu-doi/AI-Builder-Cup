import type { Metadata } from 'next';
import Link from 'next/link';
import { DatabaseIcon, GitBranchIcon, ShapesIcon } from 'lucide-react';
import { Button } from '@/app/_components/ui/button';

export const metadata: Metadata = { title: 'Configure plant model' };

export default async function PlantConfigurePage({
  params,
}: {
  readonly params: Promise<{ readonly siteId: string }>;
}) {
  const { siteId } = await params;
  const modelHref = `/plant-model/${encodeURIComponent(decodeURIComponent(siteId))}/model`;
  const items = [
    {
      title: 'Node types and properties',
      description:
        'Define reusable schemas, value sets, required fields, and card overview values.',
      icon: ShapesIcon,
    },
    {
      title: 'Catalog bindings',
      description:
        'Configure read-only scalar and choice bindings backed by governed catalog data.',
      icon: DatabaseIcon,
    },
    {
      title: 'Hierarchy and routing',
      description:
        'Edit containment, routing roles, and process relationships on the model canvas.',
      icon: GitBranchIcon,
    },
  ];
  return (
    <main className="mx-auto max-w-5xl p-4 min-[900px]:p-8">
      <h1 className="text-2xl font-semibold">Configure plant model</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Configuration remains versioned with the plant model draft.
      </p>
      <section className="mt-6 grid gap-3 md:grid-cols-3">
        {items.map(({ title, description, icon: Icon }) => (
          <article key={title} className="rounded-lg border bg-card p-5">
            <Icon className="mb-4 size-6 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 min-h-16 text-sm text-muted-foreground">{description}</p>
            <Button asChild className="mt-4" variant="outline">
              <Link href={modelHref}>Open editor</Link>
            </Button>
          </article>
        ))}
      </section>
    </main>
  );
}

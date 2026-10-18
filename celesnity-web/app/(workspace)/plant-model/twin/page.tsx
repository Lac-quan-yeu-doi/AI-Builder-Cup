import type { Metadata } from 'next';
import { DigitalTwinEntry } from '../_components/digital-twin-entry';

export const metadata: Metadata = { title: 'Digital twin' };

export default function DigitalTwinPage() {
  return <DigitalTwinEntry />;
}

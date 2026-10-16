import type { WalkthroughObservation } from '@/src/entities/models/plant-walkthrough';

/*
 * Gemini's recorded answer for a public walkthrough of a feed pellet line
 * (RICHI Manufacture, Wikimedia Commons, CC BY-SA 4.0), so the screen can be
 * tried without a video or a Gemini key.
 */
export const PELLET_LINE_SAMPLE: WalkthroughObservation = {
  siteName: 'Henan Richi Machinery Co., Ltd.',
  summary:
    'This facility showcases a 1-2 t/h compact animal feed pellet manufacturing line. Feed ingredients flow through conditioning and pellet extrusion, cooling, and screening into finished pellets.',
  areas: [
    {
      id: 'workshop-floor',
      name: 'Assembly & Demonstration Workshop',
      evidence: [
        {
          tSec: 3,
          note: 'Industrial workshop floor with high ceiling and demo processing equipment installed.',
          confidence: 0.95,
        },
      ],
    },
  ],
  lines: [
    {
      id: 'feed-pellet-line',
      name: '1-2t/h Animal Feed Pellet Making Line',
      areaId: 'workshop-floor',
      evidence: [
        {
          tSec: 14,
          note: "Control cabinet displaying the title '1-2t/h animal feed pellet making line'.",
          confidence: 0.98,
        },
      ],
    },
  ],
  equipment: [
    {
      id: 'pellet-cooler-screener',
      name: 'Pellet Cooler & Vibrating Screen',
      kind: 'machine',
      equipmentType: 'counterflow cooler and vibrating screener',
      lineId: 'feed-pellet-line',
      areaId: 'workshop-floor',
      visibleState: 'idle',
      evidence: [
        {
          tSec: 2,
          note: 'Vertical cooler chamber mounted on a structural frame above a vibrating screen sorter.',
          confidence: 0.95,
        },
      ],
    },
    {
      id: 'pellet-mill',
      name: 'Feed Pellet Mill with Conditioner',
      kind: 'machine',
      equipmentType: 'ring die pellet mill',
      lineId: 'feed-pellet-line',
      areaId: 'workshop-floor',
      visibleState: 'idle',
      evidence: [
        {
          tSec: 7,
          note: 'Pellet mill base with motorized screw feeder/conditioner and overhead conical feed hopper.',
          confidence: 0.96,
        },
      ],
    },
    {
      id: 'pneumatic-cyclone',
      name: 'Cyclone Dust Collector',
      kind: 'utility',
      equipmentType: 'cyclone separator',
      lineId: 'feed-pellet-line',
      areaId: 'workshop-floor',
      visibleState: 'idle',
      evidence: [
        {
          tSec: 4,
          note: 'Conical cyclone separator connected via ductwork between the pelleting and cooling units.',
          confidence: 0.9,
        },
      ],
    },
    {
      id: 'feed-elevator',
      name: 'Vertical Bucket Elevator',
      kind: 'conveyor',
      equipmentType: 'bucket elevator',
      lineId: 'feed-pellet-line',
      areaId: 'workshop-floor',
      visibleState: 'idle',
      evidence: [
        {
          tSec: 11,
          note: 'Vertical leg and motor head of an elevator feeding into the pellet mill surge hopper.',
          confidence: 0.88,
        },
      ],
    },
    {
      id: 'control-cabinet',
      name: 'Line Control Panel',
      kind: 'station',
      equipmentType: 'electrical control cabinet',
      lineId: 'feed-pellet-line',
      areaId: 'workshop-floor',
      visibleState: 'idle',
      evidence: [
        {
          tSec: 15,
          note: 'Centralized control panel with mimic flow diagram, voltmeters, and switch controls.',
          confidence: 0.98,
        },
      ],
    },
  ],
  flows: [
    {
      fromId: 'feed-elevator',
      toId: 'pellet-mill',
      material: 'conditioned feed mash',
      inferred: true,
      evidence: [
        {
          tSec: 11,
          note: 'Elevator discharge chute directs material into the conical surge hopper above the pellet mill.',
          confidence: 0.85,
        },
      ],
    },
    {
      fromId: 'pellet-mill',
      toId: 'pellet-cooler-screener',
      material: 'hot feed pellets',
      inferred: true,
      evidence: [
        {
          tSec: 4,
          note: 'Pellet output discharge connects via pneumatic transfer ducting toward the cooler inlet.',
          confidence: 0.8,
        },
      ],
    },
  ],
  openQuestions: [
    'At 00:00, is raw ingredient grinding and mixing handled off-frame upstream of the elevator?',
    'At 00:04, does the cyclone separator discharge directly into the cooler or route dust fines back to the pellet mill hopper?',
    'At 00:15, does the system include an automatic bagging and weighing station after the vibrating screener output?',
  ],
};

export type RockTypeId = 'sedimentary' | 'limestone' | 'granite' | 'basalt' | 'metamorphic';

export type RockTypeDef = {
  id: RockTypeId;
  permeability: number;    // [0,1] — low = water pools on surface, high = water drains freely
  fertilityBase: number;   // [0,1] — baseline soil fertility before climate modifiers
  oreAffinities: Partial<Record<string, number>>; // multipliers on base ore rates from PipelineConfig
};

export const rockTypes: RockTypeDef[] = [
  {
    id: 'sedimentary',
    permeability: 0.55,
    fertilityBase: 0.65,
    oreAffinities: { iron: 2.0, coal: 3.0, salt: 1.5 },
  },
  {
    id: 'limestone',
    permeability: 0.70,
    fertilityBase: 0.60,
    oreAffinities: { iron: 0.5, coal: 0.5, salt: 3.0, gems: 0.8 },
  },
  {
    id: 'granite',
    permeability: 0.20,
    fertilityBase: 0.25,
    oreAffinities: { gold: 2.5, gems: 1.5, iron: 0.3 },
  },
  {
    id: 'basalt',
    permeability: 0.45,
    fertilityBase: 0.80,
    oreAffinities: { iron: 1.5, sulfur: 2.0, gold: 0.8, gems: 0.5 },
  },
  {
    id: 'metamorphic',
    permeability: 0.30,
    fertilityBase: 0.45,
    oreAffinities: { gold: 1.5, gems: 3.0, iron: 0.8 },
  },
];

const byId = new Map<RockTypeId, RockTypeDef>(rockTypes.map((r) => [r.id, r]));

export function getRockType(id: RockTypeId): RockTypeDef {
  return byId.get(id)!;
}

export const ALL_ROCK_TYPE_IDS: RockTypeId[] = rockTypes.map((r) => r.id);

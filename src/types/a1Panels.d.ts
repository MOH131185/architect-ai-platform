import type { MasterDNA } from './schemas.js';

export type A1PanelType =
  | 'hero_3d'
  | 'floor_plan_ground'
  | 'floor_plan_first'
  | 'elevation_north'
  | 'elevation_south'
  | 'elevation_east'
  | 'elevation_west'
  | 'section_AA'
  | 'section_BB'
  | 'site_diagram'
  | 'program_diagram'
  | 'climate_diagram'
  | 'interior_3d'
  | 'floor_plan_level2';

export interface GeneratedPanel {
  id: string;
  type: A1PanelType;
  imageUrl: string;
  width: number;
  height: number;
  seed: number;
  prompt: string;
  negativePrompt: string;
  dnaSnapshot: MasterDNA;
  orientation?: 'landscape' | 'portrait';
  meta?: {
    viewName?: string;
    levelIndex?: number;
    timestamp?: string;
    camera?: any;
  };
}

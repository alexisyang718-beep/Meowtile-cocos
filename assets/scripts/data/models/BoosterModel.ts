import { BoosterType } from '../../core/Types';

export interface BoosterConfig {
    id: BoosterType;
    name: string;
    icon: string;
    initialCount: number;
    cooldownSeconds: number;
    description: string;
}

export type BoosterInventory = Record<BoosterType, number>;

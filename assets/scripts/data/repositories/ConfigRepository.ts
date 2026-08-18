import { JsonAsset, resources } from 'cc';
import { RESOURCE_PATHS } from '../../core/Constants';
import { BoosterConfig } from '../models/BoosterModel';
import { TileTypeConfig } from '../models/TileModel';

export class ConfigRepository {
    private static tileTypes: TileTypeConfig[] | null = null;
    private static boosters: BoosterConfig[] | null = null;

    static async loadTileTypes(): Promise<TileTypeConfig[]> {
        if (this.tileTypes) return this.tileTypes;
        this.tileTypes = await this.loadJson<TileTypeConfig[]>(RESOURCE_PATHS.tileTypes);
        return this.tileTypes;
    }

    static async loadBoosters(): Promise<BoosterConfig[]> {
        if (this.boosters) return this.boosters;
        this.boosters = await this.loadJson<BoosterConfig[]>(RESOURCE_PATHS.boosters);
        return this.boosters;
    }

    private static loadJson<T>(path: string): Promise<T> {
        return new Promise((resolve, reject) => {
            resources.load(path, JsonAsset, (error, asset) => {
                if (error || !asset) {
                    reject(new Error(`Config not found: ${path}`));
                    return;
                }
                resolve(asset.json as T);
            });
        });
    }
}

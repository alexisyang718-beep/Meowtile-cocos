import { JsonAsset, resources } from 'cc';
import { BeadGroupConfig, BeadPuzzleData } from './BeadPuzzleTypes';

export class BeadPuzzleRepository {
    private static cache = new Map<string, BeadPuzzleData>();

    static async load(resourcePath: string): Promise<BeadPuzzleData> {
        const cached = this.cache.get(resourcePath);
        if (cached) return cached;
        const raw = await this.loadJson<BeadPuzzleData>(resourcePath);
        const normalized = this.normalize(raw);
        this.cache.set(resourcePath, normalized);
        this.cache.set(normalized.id, normalized);
        return normalized;
    }

    static async tryLoad(resourcePath: string): Promise<BeadPuzzleData | null> {
        try {
            return await this.load(resourcePath);
        } catch (_error) {
            return null;
        }
    }

    static clearCache(): void {
        this.cache.clear();
    }

    private static normalize(raw: BeadPuzzleData): BeadPuzzleData {
        const groups = (raw.groups ?? []).map((group) => this.normalizeGroup(group));
        return {
            ...raw,
            groups,
            cells: raw.cells ?? [],
            palette: raw.palette ?? [],
        };
    }

    private static normalizeGroup(group: BeadGroupConfig): BeadGroupConfig {
        return {
            ...group,
            unlockLevelId: group.unlockLevelId ?? group.levelId ?? group.id,
        };
    }

    private static loadJson<T>(path: string): Promise<T> {
        return new Promise((resolve, reject) => {
            resources.load(path, JsonAsset, (error, asset) => {
                if (error || !asset) {
                    reject(new Error(`Bead puzzle not found: ${path}`));
                    return;
                }
                resolve(asset.json as T);
            });
        });
    }
}

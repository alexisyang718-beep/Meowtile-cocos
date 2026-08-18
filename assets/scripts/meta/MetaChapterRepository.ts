import { JsonAsset, resources } from 'cc';
import { LevelId } from '../core/Types';

const META_CHAPTERS_PATH = 'config/meta/meta_chapters';

export interface MetaThemeConfig {
    icon?: string;
    accentColor?: string;
    background: string;
}

export interface MetaSubchapterConfig {
    id: string;
    title: string;
    displayName: string;
    levelRange: [LevelId, LevelId];
    background: string;
    puzzleId: string;
    puzzleResource: string;
    helperElement?: string;
}

export interface MetaChapterConfig {
    id: string;
    legacyChapterId?: string;
    title: string;
    name: string;
    displayName: string;
    levelRange: [LevelId, LevelId];
    unlockAfterLevel?: LevelId | null;
    theme: MetaThemeConfig;
    subchapters: MetaSubchapterConfig[];
}

export class MetaChapterRepository {
    private static chapters: MetaChapterConfig[] | null = null;

    static async loadAll(): Promise<MetaChapterConfig[]> {
        if (this.chapters) return this.chapters;
        this.chapters = await this.loadJson<MetaChapterConfig[]>(META_CHAPTERS_PATH);
        return this.chapters;
    }

    static async findChapterById(chapterId: string): Promise<MetaChapterConfig | null> {
        const chapters = await this.loadAll();
        return chapters.find((chapter) => chapter.id === chapterId || chapter.legacyChapterId === chapterId) ?? null;
    }

    static async findSubchapterById(subchapterId: string): Promise<MetaSubchapterConfig | null> {
        const chapters = await this.loadAll();
        for (const chapter of chapters) {
            const subchapter = chapter.subchapters.find((item) => item.id === subchapterId);
            if (subchapter) return subchapter;
        }
        return null;
    }

    static async findSubchapterByLevel(levelId: LevelId): Promise<MetaSubchapterConfig | null> {
        const chapters = await this.loadAll();
        for (const chapter of chapters) {
            const subchapter = chapter.subchapters.find((item) => levelId >= item.levelRange[0] && levelId <= item.levelRange[1]);
            if (subchapter) return subchapter;
        }
        return null;
    }

    static async findSubchapterByStartLevel(levelId: LevelId): Promise<MetaSubchapterConfig | null> {
        const subchapter = await this.findSubchapterByLevel(levelId);
        if (!subchapter || subchapter.levelRange[0] !== levelId) return null;
        return subchapter;
    }

    static async findNextSubchapter(subchapterId: string): Promise<MetaSubchapterConfig | null> {
        const flattened = (await this.loadAll()).flatMap((chapter) => chapter.subchapters);
        const index = flattened.findIndex((item) => item.id === subchapterId);
        if (index < 0 || index >= flattened.length - 1) return null;
        return flattened[index + 1];
    }

    static async isSubchapterStartLevel(levelId: LevelId): Promise<boolean> {
        return !!await this.findSubchapterByStartLevel(levelId);
    }

    static async isSubchapterEndLevel(levelId: LevelId): Promise<boolean> {
        const subchapter = await this.findSubchapterByLevel(levelId);
        return !!subchapter && subchapter.levelRange[1] === levelId;
    }

    static async getLevelBackground(levelId: LevelId): Promise<string | undefined> {
        return (await this.findSubchapterByLevel(levelId))?.background;
    }

    static clearCache(): void {
        this.chapters = null;
    }

    private static loadJson<T>(path: string): Promise<T> {
        return new Promise((resolve, reject) => {
            resources.load(path, JsonAsset, (error, asset) => {
                if (error || !asset) {
                    reject(new Error(`Meta config not found: ${path}`));
                    return;
                }
                resolve(asset.json as T);
            });
        });
    }
}

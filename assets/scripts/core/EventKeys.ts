export const EventKeys = {
    GameStateChanged: 'game:state-changed',
    LevelLoaded: 'level:loaded',
    TileSelected: 'tile:selected',
    TileMatched: 'tile:matched',
    SlotChanged: 'slot:changed',
    BoosterUsed: 'booster:used',
    LevelWin: 'level:win',
    LevelLose: 'level:lose',
    HudRefresh: 'hud:refresh',
    // 章节相关（v2）
    ChapterTransitionStart: 'chapter:transition-start',
    ChapterTransitionEnd: 'chapter:transition-end',
    ChapterUnlocked: 'chapter:unlocked',
    // 进度相关（v2）
    ProgressUpdated: 'progress:updated',
    // App 流程（v1.5）
    AppGoHome: 'app:go-home',
    AppGoMap: 'app:go-map',
    AppStartLevel: 'app:start-level',
    AppOpenSettings: 'app:open-settings',
    AppOpenShop: 'app:open-shop',
} as const;

export type EventKey = typeof EventKeys[keyof typeof EventKeys];

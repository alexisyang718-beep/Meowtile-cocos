import { ChapterId, LevelId } from '../../core/Types';

/**
 * 章节配置。一个章节由若干连续关卡组成。
 * 章节 id 应使用稳定结构名（如 chapter1/chapter2），具体主题、背景和换肤信息放在配置字段中。
 */
export interface ChapterModel {
    id: ChapterId;
    /** 章节展示名，如「巴黎」 */
    name: string;
    /** 地标名，如「埃菲尔铁塔」（章节切换页大标题） */
    landmarkName: string;
    /** 章节文案介绍 */
    description: string;
    /** 章节背景图 resources 相对路径（不带扩展名），如 "newtheme/bg/chapter1/1" */
    backgroundImage: string;
    /** v1.5：地图页章节卡片缩略图 resources 相对路径（可省略，省略时复用 backgroundImage） */
    mapThumbnail?: string;
    /** v1.5：地图页章节图标 emoji（如 🇫🇷），可省略 */
    flagEmoji?: string;
    /** v1.6：章节主题色，用于二级地图页/切换页强调色 */
    themeColor?: string;
    /** v1.6：地图二级页顶部主视觉图 */
    detailHeroImage?: string;
    /** v1.6：地图二级页景点图片列表 */
    detailMapImages?: string[];
    /** v1.6：地图二级页景点文案列表，索引与 detailMapImages / levelRange 对齐 */
    detailMapCardLabels?: string[];
    /** v1.6：关卡切换页背景图，缺省时回退到关卡 background / 章节背景 */
    transitionBackground?: string;
    /** v1.6：关卡切换页按钮和装饰强调色 */
    transitionAccent?: string;
    /** v1.6：地图二级页路径线颜色 */
    detailLineColor?: string;
    /** v1.6：地图二级页底部按钮文案 */
    buttonLabel?: string;
    /** 章节包含的关卡范围（含两端，闭区间） */
    levelRange: [LevelId, LevelId];
    /** 解锁条件：通关此关卡后解锁本章（null 表示初始解锁） */
    unlockAfterLevel?: LevelId | null;
    /** 显示顺序（小的在前） */
    order: number;
}

export interface ChapterTransitionContext {
    fromChapter: ChapterModel;
    toChapter: ChapterModel;
    /** 触发跳转的关卡 id（通常是 fromChapter 的最后一关） */
    triggerLevelId: LevelId;
}

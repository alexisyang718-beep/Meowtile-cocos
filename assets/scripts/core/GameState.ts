export enum GameState {
    Home = 'Home',
    LevelSelect = 'LevelSelect',
    Loading = 'Loading',
    Playing = 'Playing',
    Paused = 'Paused',
    Win = 'Win',
    Lose = 'Lose',
    /** v2: 关卡通关后、进入下一章前的章节介绍页 */
    ChapterTransition = 'ChapterTransition',
}

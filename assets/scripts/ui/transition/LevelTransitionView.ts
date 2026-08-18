import { _decorator, Button, Component, Label, Node, Sprite, tween, Vec3 } from 'cc';
import { LevelModel } from '../../data/models/LevelModel';
import { ScreenAdapter } from '../common/ScreenAdapter';
import { UI_LAYOUT } from '../common/UILayoutConfig';
import { bindPressScale, colorFromHex, createLabel, createNode, drawRect, GAME_FONT_FAMILY, loadSpriteFrameFromResources } from '../common/UiFactory';

const { ccclass } = _decorator;

const TRANSITION_FONT_FAMILY = GAME_FONT_FAMILY;

interface LandmarkInfo {
    title: string;
    description: string;
}

const LEVEL_LANDMARKS: Record<number, LandmarkInfo> = {
    1: { title: 'Level 1', description: 'A soft opening puzzle for learning the basic tile rhythm.' },
    2: { title: 'Level 2', description: 'Continue practicing simple matches before new obstacles appear.' },
    3: { title: 'Level 3', description: 'A light variation introduces early planning without changing the theme.' },
    4: { title: 'Level 4', description: 'Finish the first mini set and complete the first bead group.' },
    5: { title: 'Level 5', description: 'A new subchapter begins with a familiar board and a fresh background.' },
    6: { title: 'Level 6', description: 'The board grows slowly while keeping the goal clear and readable.' },
    7: { title: 'Level 7', description: 'A gentle reward beat keeps the early chapter relaxed.' },
    8: { title: 'Level 8', description: 'Close the second subchapter with a slightly fuller board.' },
    9: { title: 'Level 9', description: 'Introduce a small amount of pressure after the player understands matching.' },
    10: { title: 'Level 10', description: 'Use one focused mechanism and keep the rest of the board clean.' },
    11: { title: 'Level 11', description: 'Combine a light obstacle with enough open matches to stay friendly.' },
    12: { title: 'Level 12', description: 'Complete the first chapter and prepare for deeper mechanics.' },
};

export interface LevelTransitionHandlers {
    onContinue: () => void;
}

@ccclass('LevelTransitionView')
export class LevelTransitionView extends Component {
    show(level: LevelModel, handlers: LevelTransitionHandlers): void {
        this.node.active = true;
        this.node.removeAllChildren();
        ScreenAdapter.applyFullscreen(this.node);

        const cfg = UI_LAYOUT.transition;
        const size = ScreenAdapter.fullSize();
        const bg = createNode(this.node, 'TransitionBg', 0, 0, size.width, size.height);
        const bgSprite = bg.addComponent(Sprite);
        bgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources(level.background ?? 'newtheme/bg/chapter1/1', (frame) => {
            if (frame) bgSprite.spriteFrame = frame;
        });

        const blueOverlay = createNode(this.node, 'BlueOverlay', 0, 0, size.width, size.height);
        drawRect(blueOverlay, size.width, size.height, colorFromHex('#2F6BFF', cfg.overlayAlpha), undefined, 0, 0);

        const info = LEVEL_LANDMARKS[level.id] ?? {
            title: level.name,
            description: 'A new destination is ready. Clear the board and continue your journey.',
        };

        const titleLines = this.formatTitle(info.title, cfg.longTitleWordThreshold).split('\n');
        const titleLineHeight = Math.round(cfg.titleFontSize * cfg.titleLineHeightRatio);
        const firstTitleLineY = cfg.titleY + (titleLines.length - 1) * titleLineHeight / 2;
        titleLines.forEach((line, index) => {
            const title = createLabel(this.node, `LandmarkTitle_${index}`, line, 0, firstTitleLineY - index * titleLineHeight, cfg.titleFontSize, colorFromHex('#FFFFFF'), size.width * cfg.titleWidthRatio, titleLineHeight);
            title.fontFamily = TRANSITION_FONT_FAMILY;
            title.lineHeight = titleLineHeight;
            title.overflow = Label.Overflow.SHRINK;
        });
        const lastTitleLineY = firstTitleLineY - (titleLines.length - 1) * titleLineHeight;
        const titleToLevelGap = cfg.titleY - cfg.levelY;
        const levelToDescGap = cfg.levelY - cfg.descY;
        const levelY = lastTitleLineY - titleToLevelGap;
        const descY = levelY - levelToDescGap;

        const levelLabel = createLabel(this.node, 'LevelLabel', `LEVEL ${level.id}`, 0, levelY, cfg.levelFontSize, colorFromHex('#FFE8A4'), cfg.levelWidth, cfg.levelHeight);
        levelLabel.fontFamily = TRANSITION_FONT_FAMILY;

        const desc = createLabel(this.node, 'Description', info.description, 0, descY, cfg.descFontSize, colorFromHex('#EAF3FF'), size.width * cfg.descWidthRatio, cfg.descHeight);
        desc.fontFamily = TRANSITION_FONT_FAMILY;
        desc.lineHeight = Math.round(cfg.descFontSize * 1.25);
        desc.overflow = Label.Overflow.SHRINK;

        const buttonW = ScreenAdapter.responsiveWidth(cfg.buttonWidth, cfg.buttonHorizontalPadding, cfg.buttonMinWidth);
        const button = createNode(this.node, 'ContinueButton', 0, cfg.buttonY, buttonW, cfg.buttonHeight);
        button.setScale(new Vec3(cfg.buttonScale, cfg.buttonScale, 1));
        const buttonBg = createNode(button, 'ContinueBg', 0, 0, buttonW, cfg.buttonHeight);
        const buttonSprite = buttonBg.addComponent(Sprite);
        buttonSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadSpriteFrameFromResources(cfg.buttonPath, (frame) => {
            if (frame) buttonSprite.spriteFrame = frame;
        });
        button.addComponent(Button);
        bindPressScale(button, 0.95);
        button.on(Node.EventType.TOUCH_END, handlers.onContinue);

        this.node.setScale(new Vec3(1.02, 1.02, 1));
        tween(this.node)
            .to(0.22, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    private formatTitle(title: string, threshold: number): string {
        const words = title.trim().split(/\s+/).filter(Boolean);
        if (words.length <= 1 || title.length <= threshold) return title;
        if (words.length >= 3 && words.slice(-2).join(' ') === 'National Park') {
            return `${words.slice(0, -2).join(' ')}\nNational Park`;
        }
        const splitIndex = Math.ceil(words.length / 2);
        return `${words.slice(0, splitIndex).join(' ')}\n${words.slice(splitIndex).join(' ')}`;
    }

    hide(): void {
        this.node.active = false;
        this.node.removeAllChildren();
    }
}

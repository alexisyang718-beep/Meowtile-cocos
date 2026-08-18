import { BoosterUseResult } from '../../core/Types';

export class ShuffleBooster {
    use(): BoosterUseResult {
        return { success: false, type: 'shuffle', message: 'ShuffleBooster not implemented' };
    }
}

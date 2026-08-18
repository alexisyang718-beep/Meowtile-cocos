import { BoosterUseResult } from '../../core/Types';

export class HintBooster {
    use(): BoosterUseResult {
        return { success: false, type: 'hint', message: 'HintBooster not implemented' };
    }
}

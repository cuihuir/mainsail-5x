import { describe, expect, it } from 'vitest'
import { resolveCancellationTarget } from '@/components/operationCancel'

describe('operation cancellation target', () => {
    it('prioritizes a running print over operation abort', () => {
        expect(resolveCancellationTarget('printing', true)).toBe('print')
        expect(resolveCancellationTarget('paused', true)).toBe('print')
        expect(resolveCancellationTarget('printing', false)).toBe('print')
        expect(resolveCancellationTarget('paused', false)).toBe('print')
    })

    it('uses operation abort outside an active print', () => {
        expect(resolveCancellationTarget('standby', true)).toBe('operation')
        expect(resolveCancellationTarget('complete', true)).toBe('operation')
    })

    it('hides the control when neither cancellation path is available', () => {
        expect(resolveCancellationTarget('standby', false)).toBeNull()
    })
})

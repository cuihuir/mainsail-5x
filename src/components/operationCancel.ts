export type CancellationTarget = 'print' | 'operation'

export function resolveCancellationTarget(
    printerState: string,
    operationAbortSupported: boolean
): CancellationTarget | null {
    if (['printing', 'paused'].includes(printerState)) return 'print'
    if (operationAbortSupported) return 'operation'

    return null
}

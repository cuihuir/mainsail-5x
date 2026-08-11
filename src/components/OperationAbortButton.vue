<template>
    <div v-if="cancelSupported" class="d-none d-sm-flex operation-abort-wrapper">
        <v-btn
            tile
            :icon="$vuetify.breakpoint.smAndDown"
            :text="$vuetify.breakpoint.mdAndUp"
            color="warning"
            class="button-min-width-auto px-3 operation-abort-button"
            :aria-label="buttonTitle"
            :title="buttonTitle"
            :disabled="buttonDisabled"
            :loading="buttonLoading"
            @click="openCancellationConfirmation">
            <v-icon :class="iconClasses">{{ mdiStopCircleOutline }}</v-icon>
            <span class="d-none d-md-inline">{{ buttonLabel }}</span>
        </v-btn>
        <confirmation-dialog
            v-model="showConfirmationDialog"
            :title="$t('App.TopBar.CancelConfirmationTitle')"
            :text="confirmationText"
            :action-button-text="confirmationActionLabel"
            :cancel-button-text="$t('Buttons.No')"
            action-button-color="error"
            @action="confirmCancellation" />
    </div>
</template>

<script lang="ts">
import axios from 'axios'
import { mdiStopCircleOutline } from '@mdi/js'
import { Component, Mixins, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import ConfirmationDialog from '@/components/dialogs/ConfirmationDialog.vue'
import { resolveCancellationTarget } from '@/components/operationCancel'

const OPERATION_ABORT_ENDPOINT = '/printer/operation_abort/abort'
const OPERATION_ABORT_REASON = 'mainsail_toolbar'
const PRINT_CANCEL_LOADING = 'topbarPrintCancel'

interface OperationAbortStatus {
    abort_requested?: boolean
    accepted?: boolean
    active?: boolean
    operation?: string
    phase?: string
}

interface OperationAbortResponse {
    result: OperationAbortStatus
}

@Component({
    components: { ConfirmationDialog },
})
export default class OperationAbortButton extends Mixins(BaseMixin) {
    mdiStopCircleOutline = mdiStopCircleOutline

    abortPending = false
    requestPending = false
    showConfirmationDialog = false

    get operationAbortStatus(): OperationAbortStatus | null {
        return this.$store.state.printer.operation_abort ?? null
    }

    get operationAbortSupported(): boolean {
        return this.operationAbortStatus !== null
    }

    get cancelTarget() {
        return resolveCancellationTarget(this.printer_state, this.operationAbortSupported)
    }

    get cancelSupported(): boolean {
        return this.cancelTarget !== null
    }

    get printActive(): boolean {
        return this.cancelTarget === 'print'
    }

    get printCancelPending(): boolean {
        return this.loadings.includes(PRINT_CANCEL_LOADING)
    }

    get operationActive(): boolean {
        return this.operationAbortStatus?.active ?? false
    }

    get operationAbortRequested(): boolean {
        return this.operationAbortStatus?.abort_requested ?? false
    }

    get operationName(): string {
        return this.operationAbortStatus?.operation ?? ''
    }

    get operationPhase(): string {
        return this.operationAbortStatus?.phase ?? ''
    }

    get buttonDisabled(): boolean {
        if (this.printActive) return this.printCancelPending

        return this.requestPending || this.abortPending || this.operationAbortRequested
    }

    get buttonLoading(): boolean {
        return this.requestPending || this.printCancelPending
    }

    get buttonLabel(): string {
        if (this.printActive) {
            const key = this.printCancelPending ? 'App.TopBar.CancelPrintPending' : 'App.TopBar.CancelPrint'

            return this.$t(key).toString()
        }

        const key = this.buttonDisabled ? 'App.TopBar.CancelOperationPending' : 'App.TopBar.CancelOperation'

        return this.$t(key).toString()
    }

    get buttonTitle(): string {
        if (this.printActive) {
            const key = this.printCancelPending ? 'App.TopBar.CancelPrintPending' : 'App.TopBar.CancelPrintHint'

            return this.$t(key).toString()
        }
        if (this.buttonDisabled) return this.$t('App.TopBar.CancelOperationPending').toString()
        if (!this.operationActive || !this.operationName) {
            return this.$t('App.TopBar.CancelOperationHint').toString()
        }
        if (!this.operationPhase) {
            return this.$t('App.TopBar.CancelOperationActive', { operation: this.operationName }).toString()
        }

        return this.$t('App.TopBar.CancelOperationActivePhase', {
            operation: this.operationName,
            phase: this.operationPhase,
        }).toString()
    }

    get confirmationText(): string {
        if (this.printActive) return this.$t('App.TopBar.CancelConfirmationPrint').toString()
        if (!this.operationActive || !this.operationName) {
            return this.$t('App.TopBar.CancelConfirmationOperationGeneric').toString()
        }
        if (!this.operationPhase) {
            return this.$t('App.TopBar.CancelConfirmationOperation', { operation: this.operationName }).toString()
        }

        return this.$t('App.TopBar.CancelConfirmationOperationPhase', {
            operation: this.operationName,
            phase: this.operationPhase,
        }).toString()
    }

    get confirmationActionLabel(): string {
        const key = this.printActive ? 'App.TopBar.CancelPrint' : 'App.TopBar.CancelOperation'

        return this.$t(key).toString()
    }

    get iconClasses(): Record<string, boolean> {
        return {
            'mr-md-2': true,
            'operation-abort-pulse': (this.printActive || this.operationActive) && !this.buttonDisabled,
        }
    }

    @Watch('operationActive')
    onOperationActiveChanged(active: boolean): void {
        if (!active) this.abortPending = false
    }

    openCancellationConfirmation(): void {
        if (this.buttonDisabled) return

        this.showConfirmationDialog = true
    }

    confirmCancellation(): void {
        if (this.printActive) {
            this.requestPrintCancel()
            return
        }

        void this.requestOperationAbort()
    }

    requestPrintCancel(): void {
        if (this.printCancelPending) return

        this.$socket.emit('printer.print.cancel', {}, { loading: PRINT_CANCEL_LOADING })
    }

    async requestOperationAbort(): Promise<void> {
        if (this.requestPending || this.abortPending || this.operationAbortRequested) return

        this.requestPending = true
        try {
            const apiUrl = this.$store.getters['socket/getUrl'] as string
            const response = await axios.post<OperationAbortResponse>(`${apiUrl}${OPERATION_ABORT_ENDPOINT}`, null, {
                params: { reason: OPERATION_ABORT_REASON },
            })
            const result = response.data.result
            this.abortPending = Boolean(result.accepted && result.active)

            if (result.accepted) {
                this.$toast.success(this.$t('App.TopBar.CancelOperationAccepted').toString())
                return
            }

            this.$toast.info(this.$t('App.TopBar.CancelOperationNone').toString())
        } catch {
            this.$toast.error(this.$t('App.TopBar.CancelOperationFailed').toString())
        } finally {
            this.requestPending = false
        }
    }
}
</script>

<style scoped>
.operation-abort-wrapper {
    height: 100%;
}

.operation-abort-button {
    min-width: auto !important;
    height: 100% !important;
    max-height: none;
}

.operation-abort-pulse {
    animation: operation-abort-pulse 1.15s ease-in-out infinite;
}

@keyframes operation-abort-pulse {
    0%,
    100% {
        opacity: 1;
        transform: scale(1);
    }
    50% {
        opacity: 0.58;
        transform: scale(0.9);
    }
}
</style>

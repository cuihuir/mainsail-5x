<template>
    <v-btn
        v-if="operationAbortSupported"
        tile
        :icon="$vuetify.breakpoint.smAndDown"
        :text="$vuetify.breakpoint.mdAndUp"
        color="warning"
        class="button-min-width-auto px-3 d-none d-sm-flex operation-abort-button"
        :aria-label="buttonTitle"
        :title="buttonTitle"
        :disabled="buttonDisabled"
        :loading="requestPending"
        @click="requestOperationAbort">
        <v-icon :class="iconClasses">{{ mdiStopCircleOutline }}</v-icon>
        <span class="d-none d-md-inline">{{ buttonLabel }}</span>
    </v-btn>
</template>

<script lang="ts">
import axios from 'axios'
import { mdiStopCircleOutline } from '@mdi/js'
import { Component, Vue, Watch } from 'vue-property-decorator'

const OPERATION_ABORT_ENDPOINT = '/printer/operation_abort/abort'
const OPERATION_ABORT_REASON = 'mainsail_toolbar'

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

@Component
export default class OperationAbortButton extends Vue {
    mdiStopCircleOutline = mdiStopCircleOutline

    abortPending = false
    requestPending = false

    get operationAbortStatus(): OperationAbortStatus | null {
        return this.$store.state.printer.operation_abort ?? null
    }

    get operationAbortSupported(): boolean {
        return this.operationAbortStatus !== null
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
        return this.requestPending || this.abortPending || this.operationAbortRequested
    }

    get buttonLabel(): string {
        const key = this.buttonDisabled ? 'App.TopBar.CancelOperationPending' : 'App.TopBar.CancelOperation'

        return this.$t(key).toString()
    }

    get buttonTitle(): string {
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

    get iconClasses(): Record<string, boolean> {
        return {
            'mr-md-2': true,
            'operation-abort-pulse': this.operationActive && !this.buttonDisabled,
        }
    }

    @Watch('operationActive')
    onOperationActiveChanged(active: boolean): void {
        if (!active) this.abortPending = false
    }

    async requestOperationAbort(): Promise<void> {
        if (this.buttonDisabled) return

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

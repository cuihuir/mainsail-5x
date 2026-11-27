<template>
    <v-dialog
        v-model="showDialog"
        :max-width="400"
        content-class="overflow-x-hidden"
        @click:outside="closeDialog"
        @keydown.esc="closeDialog">
        <v-card>
            <start-print-dialog-thumbnail :file="file" :current-path="currentPath" />
            <v-card-title class="text-h5">{{ $t('Dialogs.StartPrint.Headline') }}</v-card-title>
            <v-card-text class="pb-0">
                <p class="body-2">
                    {{ question }}
                </p>
            </v-card-text>
            <start-print-dialog-afc v-if="afcExists" :file="file" />
            <start-print-dialog-mmu v-else-if="existsMmu" :file="file" />
            <start-print-dialog-spoolman v-else-if="existsSpoolman" :file="file" />
            <start-print-dialog-timelapse v-if="existsTimelapse" />
            <v-card-text v-if="levelingSupport" class="py-3 bt-1">
                <settings-row v-if="levelingSupport.zTilt" :title="$t('Dialogs.StartPrint.ZTiltAdjust')" :dense="true">
                    <v-switch v-model="zTiltEnabled" hide-details class="mt-0" />
                </settings-row>
                <template v-if="levelingSupport.bedMesh === 'mode'">
                    <div class="font-weight-bold mt-2 mb-2">{{ $t('Dialogs.StartPrint.BedMesh') }}</div>
                    <v-btn-toggle v-model="bedMeshMode" mandatory dense color="primary" class="d-flex mb-1">
                        <v-btn
                            v-for="item in bedMeshModeItems"
                            :key="item.value"
                            :value="item.value"
                            :disabled="item.disabled"
                            class="flex-grow-1">
                            {{ item.text }}
                        </v-btn>
                    </v-btn-toggle>
                </template>
                <settings-row
                    v-else-if="levelingSupport.bedMesh === 'switch'"
                    :title="$t('Dialogs.StartPrint.AdaptiveBedMesh')"
                    :dense="true">
                    <v-switch v-model="adaptiveBedMesh" hide-details class="mt-0" />
                </settings-row>
            </v-card-text>
            <v-divider v-if="showDivider" class="my-0" />
            <v-card-actions>
                <v-spacer />
                <v-btn text @click="closeDialog">{{ $t('Buttons.Cancel') }}</v-btn>
                <v-btn
                    color="primary"
                    text
                    :disabled="printerIsPrinting || !klipperReadyForGui"
                    @click="startPrint(file.filename)">
                    {{ $t('Dialogs.StartPrint.Print') }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import { Component, Mixins, Prop, VModel, Watch } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { FileStateGcodefile } from '@/store/files/types'
import SettingsRow from '@/components/settings/SettingsRow.vue'
import { mdiPrinter3d } from '@mdi/js'
import { ServerSpoolmanStateSpool } from '@/store/server/spoolman/types'
import AfcMixin from '@/components/mixins/afc'
import {
    BedMeshMode,
    buildPrintStartScript,
    findPrintStartMacro,
    initialLevelingChoice,
    PrintStartLevelingChoice,
    PrintStartLevelingSupport,
    resolveLevelingSupport,
} from '@/components/printStartLeveling'

@Component({
    components: { SettingsRow },
})
export default class StartPrintDialog extends Mixins(BaseMixin, AfcMixin) {
    zTiltEnabled = true
    bedMeshMode: BedMeshMode = 'adaptive'
    mdiPrinter3d = mdiPrinter3d

    @VModel({ type: Boolean }) showDialog!: boolean
    @Prop({ required: true, default: '' }) readonly currentPath!: string
    @Prop({ required: true }) readonly file!: FileStateGcodefile

    get existsMmu() {
        return this.$store.state.printer.mmu?.enabled && this.$store.state.printer.mmu?.gate !== -2
    }

    get existsSpoolman() {
        return this.moonrakerComponents.includes('spoolman')
    }

    get existsTimelapse() {
        return this.moonrakerComponents.includes('timelapse')
    }

    get showDivider() {
        return this.afcExists || this.existsSpoolman || this.existsTimelapse
    }

    get printStartMacro() {
        return findPrintStartMacro(this.$store.state.printer ?? {})
    }

    get levelingSupport(): PrintStartLevelingSupport | null {
        return resolveLevelingSupport(this.printStartMacro)
    }

    // The last choice made in this dialog (Moonraker database, so it outlives a Klipper restart).
    get rememberedLeveling(): Partial<PrintStartLevelingChoice> | null {
        return this.$store.state.gui.view?.startPrintLeveling ?? null
    }

    get hasDefaultMesh(): boolean {
        return 'default' in (this.$store.state.printer.bed_mesh?.profiles ?? {})
    }

    get bedMeshModeItems() {
        return [
            { text: this.$t('Dialogs.StartPrint.BedMeshAdaptive'), value: 'adaptive' },
            { text: this.$t('Dialogs.StartPrint.BedMeshDefault'), value: 'default', disabled: !this.hasDefaultMesh },
            { text: this.$t('Dialogs.StartPrint.BedMeshNone'), value: 'none' },
        ]
    }

    get adaptiveBedMesh() {
        return this.bedMeshMode === 'adaptive'
    }

    set adaptiveBedMesh(newVal: boolean) {
        this.bedMeshMode = newVal ? 'adaptive' : 'default'
    }

    get active_spool(): ServerSpoolmanStateSpool | null {
        return this.$store.state.server.spoolman.active_spool ?? null
    }

    get question() {
        if (this.active_spool)
            return this.$t('Dialogs.StartPrint.DoYouWantToStartFilenameFilament', {
                filename: this.file?.filename ?? 'unknown',
            })

        return this.$t('Dialogs.StartPrint.DoYouWantToStartFilename', { filename: this.file?.filename ?? 'unknown' })
    }

    async startPrint(filename = '') {
        filename = (this.currentPath + '/' + filename).substring(1)
        this.closeDialog()

        // PRINT_START reads these variables; do not start with the previous settings if Klipper refused them.
        const support = this.levelingSupport
        if (support) {
            const script = buildPrintStartScript(support, {
                zTilt: this.zTiltEnabled,
                bedMeshMode: this.bedMeshMode,
            })
            try {
                await this.$socket.emitAndWait('printer.gcode.script', { script })
            } catch {
                this.$toast.error(this.$t('Dialogs.StartPrint.LevelingSettingsFailed').toString())
                return
            }
            this.$store.dispatch('gui/saveSetting', {
                name: 'view.startPrintLeveling',
                value: { zTilt: this.zTiltEnabled, bedMeshMode: this.bedMeshMode },
            })
        }

        this.$socket.emit('printer.print.start', { filename: filename }, { action: 'switchToDashboard' })
    }

    closeDialog() {
        this.showDialog = false
    }

    @Watch('showDialog')
    onShowDialogChanged(newVal: boolean) {
        if (newVal) {
            const choice = initialLevelingChoice(
                this.printStartMacro,
                this.levelingSupport,
                this.hasDefaultMesh,
                this.rememberedLeveling
            )
            this.zTiltEnabled = choice.zTilt
            this.bedMeshMode = choice.bedMeshMode
        }

        if (!newVal || !this.file || this.file.metadataPulled || this.file.metadataRequested) return

        const fullPath = ['gcodes']
        if (this.currentPath) fullPath.push(this.currentPath.replace(/^\/+/, ''))
        fullPath.push(this.file.filename)
        this.$store.dispatch('files/requestMetadata', [{ filename: fullPath.join('/') }])
    }
}
</script>

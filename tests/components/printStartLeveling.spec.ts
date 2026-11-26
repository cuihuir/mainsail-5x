import { describe, expect, it } from 'vitest'
import {
    buildPrintStartScript,
    findPrintStartMacro,
    initialLevelingChoice,
    normalizeBedMeshMode,
    resolveLevelingSupport,
} from '@/components/printStartLeveling'

describe('print start leveling options', () => {
    it('finds PRINT_START whatever its case in printer.cfg', () => {
        expect(findPrintStartMacro({ 'gcode_macro print_start': { do_z_tilt: 1 } })).toEqual({
            name: 'print_start',
            variables: { do_z_tilt: 1 },
        })
        expect(findPrintStartMacro({ 'gcode_macro PRINT_START': {} })?.name).toBe('PRINT_START')
        expect(findPrintStartMacro({ 'gcode_macro PRINT_END': {} })).toBeNull()
    })

    it('offers only the switches PRINT_START declares', () => {
        const macro = (variables: Record<string, unknown>) => ({ name: 'PRINT_START', variables })
        expect(resolveLevelingSupport(macro({ do_z_tilt: 1, bed_mesh_mode: 'adaptive' }))).toEqual({
            macroName: 'PRINT_START',
            zTilt: true,
            bedMesh: 'mode',
        })
        expect(resolveLevelingSupport(macro({ do_z_tilt: 1, do_bed_mesh: 1 }))?.bedMesh).toBe('switch')
        expect(resolveLevelingSupport(macro({ bed_mesh_mode: 'none', do_bed_mesh: 1 }))).toEqual({
            macroName: 'PRINT_START',
            zTilt: false,
            bedMesh: 'mode',
        })
        expect(resolveLevelingSupport(macro({}))).toBeNull()
        expect(resolveLevelingSupport(null)).toBeNull()
    })

    it('reads unknown mesh modes as an adaptive mesh', () => {
        expect(normalizeBedMeshMode('DEFAULT')).toBe('default')
        expect(normalizeBedMeshMode('none')).toBe('none')
        expect(normalizeBedMeshMode('full')).toBe('adaptive')
        expect(normalizeBedMeshMode(undefined)).toBe('adaptive')
    })

    it('starts from the macro values and never from a missing default profile', () => {
        const macro = { name: 'PRINT_START', variables: { do_z_tilt: 0, bed_mesh_mode: 'default' } }
        const support = resolveLevelingSupport(macro)
        expect(initialLevelingChoice(macro, support, true)).toEqual({ zTilt: false, bedMeshMode: 'default' })
        expect(initialLevelingChoice(macro, support, false)).toEqual({ zTilt: false, bedMeshMode: 'adaptive' })

        const old = { name: 'PRINT_START', variables: { do_z_tilt: 1, do_bed_mesh: 0 } }
        expect(initialLevelingChoice(old, resolveLevelingSupport(old), true)).toEqual({
            zTilt: true,
            bedMeshMode: 'default',
        })
    })

    it('sets the declared variables of the macro as named', () => {
        expect(
            buildPrintStartScript(
                { macroName: 'PRINT_START', zTilt: true, bedMesh: 'mode' },
                { zTilt: false, bedMeshMode: 'none' }
            )
        ).toBe(
            'SET_GCODE_VARIABLE MACRO=PRINT_START VARIABLE=do_z_tilt VALUE=0\n' +
                'SET_GCODE_VARIABLE MACRO=PRINT_START VARIABLE=bed_mesh_mode VALUE=\'"none"\''
        )
        expect(
            buildPrintStartScript(
                { macroName: 'print_start', zTilt: false, bedMesh: 'switch' },
                { zTilt: true, bedMeshMode: 'default' }
            )
        ).toBe('SET_GCODE_VARIABLE MACRO=print_start VARIABLE=do_bed_mesh VALUE=0')
    })
})

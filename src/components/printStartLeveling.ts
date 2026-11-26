export type BedMeshMode = 'adaptive' | 'default' | 'none'

export const BED_MESH_MODES: BedMeshMode[] = ['adaptive', 'default', 'none']

export interface PrintStartMacro {
    name: string
    variables: Record<string, unknown>
}

export interface PrintStartLevelingSupport {
    macroName: string
    zTilt: boolean
    // 'mode': PRINT_START declares bed_mesh_mode (adaptive, default or none)
    // 'switch': only the older do_bed_mesh (1 = adaptive mesh, 0 = load the default profile)
    bedMesh: 'mode' | 'switch' | null
}

export interface PrintStartLevelingChoice {
    zTilt: boolean
    bedMeshMode: BedMeshMode
}

const MACRO_PREFIX = 'gcode_macro '

// Klipper reports a macro's variables as the status of 'gcode_macro <name>', named as in printer.cfg.
export function findPrintStartMacro(printerState: Record<string, unknown>): PrintStartMacro | null {
    const key = Object.keys(printerState).find((name) => name.toLowerCase() === `${MACRO_PREFIX}print_start`)
    if (!key) return null

    const variables = printerState[key]
    return {
        name: key.slice(MACRO_PREFIX.length),
        variables: typeof variables === 'object' && variables !== null ? (variables as Record<string, unknown>) : {},
    }
}

// Only variables PRINT_START declares can be set; SET_GCODE_VARIABLE fails on any other.
export function resolveLevelingSupport(macro: PrintStartMacro | null): PrintStartLevelingSupport | null {
    if (!macro) return null

    const zTilt = 'do_z_tilt' in macro.variables
    let bedMesh: PrintStartLevelingSupport['bedMesh'] = null
    if ('bed_mesh_mode' in macro.variables) bedMesh = 'mode'
    else if ('do_bed_mesh' in macro.variables) bedMesh = 'switch'

    if (!zTilt && !bedMesh) return null

    return { macroName: macro.name, zTilt, bedMesh }
}

export function normalizeBedMeshMode(value: unknown): BedMeshMode {
    const mode = String(value ?? '').toLowerCase()
    return BED_MESH_MODES.includes(mode as BedMeshMode) ? (mode as BedMeshMode) : 'adaptive'
}

// The dialog starts from the macro's current values (its config defaults after a Klipper restart).
export function initialLevelingChoice(
    macro: PrintStartMacro | null,
    support: PrintStartLevelingSupport | null,
    hasDefaultMesh: boolean
): PrintStartLevelingChoice {
    const variables = macro?.variables ?? {}
    const zTilt = !support?.zTilt || Number(variables.do_z_tilt ?? 1) !== 0

    let bedMeshMode: BedMeshMode = 'adaptive'
    if (support?.bedMesh === 'mode') bedMeshMode = normalizeBedMeshMode(variables.bed_mesh_mode)
    else if (support?.bedMesh === 'switch')
        bedMeshMode = Number(variables.do_bed_mesh ?? 1) !== 0 ? 'adaptive' : 'default'

    if (bedMeshMode === 'default' && !hasDefaultMesh) bedMeshMode = 'adaptive'

    return { zTilt, bedMeshMode }
}

export function buildPrintStartScript(support: PrintStartLevelingSupport, choice: PrintStartLevelingChoice): string {
    const lines: string[] = []
    const set = (variable: string, value: string | number) =>
        lines.push(`SET_GCODE_VARIABLE MACRO=${support.macroName} VARIABLE=${variable} VALUE=${value}`)

    if (support.zTilt) set('do_z_tilt', choice.zTilt ? 1 : 0)
    if (support.bedMesh === 'mode') set('bed_mesh_mode', `'"${normalizeBedMeshMode(choice.bedMeshMode)}"'`)
    else if (support.bedMesh === 'switch') set('do_bed_mesh', choice.bedMeshMode === 'adaptive' ? 1 : 0)

    return lines.join('\n')
}

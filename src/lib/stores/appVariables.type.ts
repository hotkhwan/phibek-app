// src/lib/stores/appVariables.type.ts
export interface AppFontVariables {
    bodyFontFamily: string
    bodyFontSize: string
    bodyFontWeight: string
    bodyLineHeight: string
}

export interface AppColorVariables {
    theme: string
    themeRgb: string
    themeColor: string
    themeColorRgb: string

    default: string
    defaultRgb: string

    primary: string
    primaryRgb: string
    primaryBgSubtle: string
    primaryText: string
    primaryBorderSubtle: string

    secondary: string
    secondaryRgb: string
    secondaryBgSubtle: string
    secondaryText: string
    secondaryBorderSubtle: string

    success: string
    successRgb: string
    successBgSubtle: string
    successText: string
    successBorderSubtle: string

    warning: string
    warningRgb: string
    warningBgSubtle: string
    warningText: string
    warningBorderSubtle: string

    info: string
    infoRgb: string
    infoBgSubtle: string
    infoText: string
    infoBorderSubtle: string

    danger: string
    dangerRgb: string
    dangerBgSubtle: string
    dangerText: string
    dangerBorderSubtle: string

    light: string
    lightRgb: string
    lightBgSubtle: string
    lightText: string
    lightBorderSubtle: string

    dark: string
    darkRgb: string
    darkBgSubtle: string
    darkText: string
    darkBorderSubtle: string

    inverse: string
    inverseRgb: string

    white: string
    whiteRgb: string
    black: string
    blackRgb: string

    teal: string
    tealRgb: string
    indigo: string
    indigoRgb: string
    purple: string
    purpleRgb: string
    yellow: string
    yellowRgb: string
    pink: string
    pinkRgb: string
    cyan: string
    cyanRgb: string

    gray100: string
    gray200: string
    gray300: string
    gray400: string
    gray500: string
    gray600: string
    gray700: string
    gray800: string
    gray900: string

    gray100Rgb: string
    gray200Rgb: string
    gray300Rgb: string
    gray400Rgb: string
    gray500Rgb: string
    gray600Rgb: string
    gray700Rgb: string
    gray800Rgb: string
    gray900Rgb: string

    muted: string
    mutedRgb: string

    emphasisColor: string
    emphasisColorRgb: string

    bodyBg: string
    bodyBgRgb: string
    bodyColor: string
    bodyColorRgb: string

    headingColor: string

    secondaryColor: string
    secondaryColorRgb: string
    secondaryBg: string
    secondaryBgRgb: string

    tertiaryColor: string
    tertiaryColorRgb: string
    tertiaryBg: string
    tertiaryBgRgb: string

    linkColor: string
    linkColorRgb: string
    linkHoverColor: string
    linkHoverColorRgb: string

    borderColor: string
    borderColorTranslucent: string
}

export interface AppVariables {
    font: AppFontVariables
    color: AppColorVariables
}
// src/lib/stores/appVariables.ts
import { writable } from 'svelte/store'
import type { AppVariables } from './appVariables.type'

// helper อ่าน css var
function cssVar(name: string): string {
	return getComputedStyle(document.body).getPropertyValue(name).trim()
}

export function generateVariables(): AppVariables {
	return {
		font: {
			bodyFontFamily: cssVar('--bs-body-font-family'),
			bodyFontSize: cssVar('--bs-body-font-size'),
			bodyFontWeight: cssVar('--bs-body-font-weight'),
			bodyLineHeight: cssVar('--bs-body-line-height')
		},
		color: {
			theme: cssVar('--bs-theme'),
			themeRgb: cssVar('--bs-theme-rgb'),
			themeColor: cssVar('--bs-theme-color'),
			themeColorRgb: cssVar('--bs-theme-color-rgb'),

			default: cssVar('--bs-default'),
			defaultRgb: cssVar('--bs-default-rgb'),

			primary: cssVar('--bs-primary'),
			primaryRgb: cssVar('--bs-primary-rgb'),
			primaryBgSubtle: cssVar('--bs-primary-bg-subtle'),
			primaryText: cssVar('--bs-primary-text'),
			primaryBorderSubtle: cssVar('--bs-primary-border-subtle'),

			secondary: cssVar('--bs-secondary'),
			secondaryRgb: cssVar('--bs-secondary-rgb'),
			secondaryBgSubtle: cssVar('--bs-secondary-bg-subtle'),
			secondaryText: cssVar('--bs-secondary-text'),
			secondaryBorderSubtle: cssVar('--bs-secondary-border-subtle'),

			success: cssVar('--bs-success'),
			successRgb: cssVar('--bs-success-rgb'),
			successBgSubtle: cssVar('--bs-success-bg-subtle'),
			successText: cssVar('--bs-success-text'),
			successBorderSubtle: cssVar('--bs-success-border-subtle'),

			warning: cssVar('--bs-warning'),
			warningRgb: cssVar('--bs-warning-rgb'),
			warningBgSubtle: cssVar('--bs-warning-bg-subtle'),
			warningText: cssVar('--bs-warning-text'),
			warningBorderSubtle: cssVar('--bs-warning-border-subtle'),

			info: cssVar('--bs-info'),
			infoRgb: cssVar('--bs-info-rgb'),
			infoBgSubtle: cssVar('--bs-info-bg-subtle'),
			infoText: cssVar('--bs-info-text'),
			infoBorderSubtle: cssVar('--bs-info-border-subtle'),

			danger: cssVar('--bs-danger'),
			dangerRgb: cssVar('--bs-danger-rgb'),
			dangerBgSubtle: cssVar('--bs-danger-bg-subtle'),
			dangerText: cssVar('--bs-danger-text'),
			dangerBorderSubtle: cssVar('--bs-danger-border-subtle'),

			light: cssVar('--bs-light'),
			lightRgb: cssVar('--bs-light-rgb'),
			lightBgSubtle: cssVar('--bs-light-bg-subtle'),
			lightText: cssVar('--bs-light-text'),
			lightBorderSubtle: cssVar('--bs-light-border-subtle'),

			dark: cssVar('--bs-dark'),
			darkRgb: cssVar('--bs-dark-rgb'),
			darkBgSubtle: cssVar('--bs-dark-bg-subtle'),
			darkText: cssVar('--bs-dark-text'),
			darkBorderSubtle: cssVar('--bs-dark-border-subtle'),

			inverse: cssVar('--bs-inverse'),
			inverseRgb: cssVar('--bs-inverse-rgb'),

			white: cssVar('--bs-white'),
			whiteRgb: cssVar('--bs-white-rgb'),
			black: cssVar('--bs-black'),
			blackRgb: cssVar('--bs-black-rgb'),

			teal: cssVar('--bs-teal'),
			tealRgb: cssVar('--bs-teal-rgb'),
			indigo: cssVar('--bs-indigo'),
			indigoRgb: cssVar('--bs-indigo-rgb'),
			purple: cssVar('--bs-purple'),
			purpleRgb: cssVar('--bs-purple-rgb'),
			yellow: cssVar('--bs-yellow'),
			yellowRgb: cssVar('--bs-yellow-rgb'),
			pink: cssVar('--bs-pink'),
			pinkRgb: cssVar('--bs-pink-rgb'),
			cyan: cssVar('--bs-cyan'),
			cyanRgb: cssVar('--bs-cyan-rgb'),

			gray100: cssVar('--bs-gray-100'),
			gray200: cssVar('--bs-gray-200'),
			gray300: cssVar('--bs-gray-300'),
			gray400: cssVar('--bs-gray-400'),
			gray500: cssVar('--bs-gray-500'),
			gray600: cssVar('--bs-gray-600'),
			gray700: cssVar('--bs-gray-700'),
			gray800: cssVar('--bs-gray-800'),
			gray900: cssVar('--bs-gray-900'),

			gray100Rgb: cssVar('--bs-gray-100-rgb'),
			gray200Rgb: cssVar('--bs-gray-200-rgb'),
			gray300Rgb: cssVar('--bs-gray-300-rgb'),
			gray400Rgb: cssVar('--bs-gray-400-rgb'),
			gray500Rgb: cssVar('--bs-gray-500-rgb'),
			gray600Rgb: cssVar('--bs-gray-600-rgb'),
			gray700Rgb: cssVar('--bs-gray-700-rgb'),
			gray800Rgb: cssVar('--bs-gray-800-rgb'),
			gray900Rgb: cssVar('--bs-gray-900-rgb'),

			muted: cssVar('--bs-muted'),
			mutedRgb: cssVar('--bs-muted-rgb'),

			emphasisColor: cssVar('--bs-emphasis-color'),
			emphasisColorRgb: cssVar('--bs-emphasis-color-rgb'),

			bodyBg: cssVar('--bs-body-bg'),
			bodyBgRgb: cssVar('--bs-body-bg-rgb'),
			bodyColor: cssVar('--bs-body-color'),
			bodyColorRgb: cssVar('--bs-body-color-rgb'),

			headingColor: cssVar('--bs-heading-color'),

			secondaryColor: cssVar('--bs-secondary-color'),
			secondaryColorRgb: cssVar('--bs-secondary-color-rgb'),
			secondaryBg: cssVar('--bs-secondary-bg'),
			secondaryBgRgb: cssVar('--bs-secondary-bg-rgb'),

			tertiaryColor: cssVar('--bs-tertiary-color'),
			tertiaryColorRgb: cssVar('--bs-tertiary-color-rgb'),
			tertiaryBg: cssVar('--bs-tertiary-bg'),
			tertiaryBgRgb: cssVar('--bs-tertiary-bg-rgb'),

			linkColor: cssVar('--bs-link-color'),
			linkColorRgb: cssVar('--bs-link-color-rgb'),
			linkHoverColor: cssVar('--bs-link-hover-color'),
			linkHoverColorRgb: cssVar('--bs-link-hover-color-rgb'),

			borderColor: cssVar('--bs-border-color'),
			borderColorTranslucent: cssVar('--bs-border-color-translucent')
		}
	}
}

// ⚠️ สำคัญ: ห้ามใช้ []
export const appVariables = writable<AppVariables | null>(null)

import fs from 'fs'
import path from 'path'

const i18nRoot = path.resolve('i18n')
const outDir = path.resolve('messages')


const baseTemplate = {}
// const baseTemplate = {
//     $schema: 'https://inlang.com/schema/inlang-message-format'
// }

function readJson(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        return JSON.parse(raw)
    } catch (err) {
        console.error(`❌ JSON parse failed: ${filePath}`)
        console.error(err.message)
        process.exit(1)
    }
}


function writeJson(filePath, data) {
    fs.writeFileSync(
        filePath,
        JSON.stringify(data, null, 2) + '\n'
    )
}

function mergeLang(lang) {
    const langDir = path.join(i18nRoot, lang)
    const outFile = path.join(outDir, `${lang}.json`)

    if (!fs.existsSync(langDir)) {
        console.error(`❌ Missing dir: ${langDir}`)
        process.exit(1)
    }

    const result = { ...baseTemplate }
    const usedKeys = new Set()

    const files = fs.readdirSync(langDir)
        .filter(f => f.endsWith('.json'))
        .sort()

    for (const file of files) {
        const fullPath = path.join(langDir, file)
        const json = readJson(fullPath)

        for (const [key, value] of Object.entries(json)) {
            if (usedKeys.has(key)) {
                console.error(`❌ Duplicate key "${key}" in ${lang}/${file}`)
                process.exit(1)
            }
            usedKeys.add(key)
            result[key] = value
        }
    }

    // sort keys (except $schema)
    const sorted = {}
    if (result.$schema) sorted.$schema = result.$schema

    Object.keys(result)
        .filter(k => k !== '$schema')
        .sort()
        .forEach(k => {
            sorted[k] = result[k]
        })

    writeJson(outFile, sorted)
    console.log(`✅ merged → messages/${lang}.json (${usedKeys.size} keys)`)
}

fs.mkdirSync(outDir, { recursive: true })

mergeLang('en')
mergeLang('th')

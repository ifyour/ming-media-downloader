import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const sizes = [192, 512]
const input = path.resolve('public/favicon.svg')
const outDir = path.resolve('public')

async function generate() {
  for (const size of sizes) {
    const output = path.join(outDir, `icon-${size}x${size}.png`)
    await sharp(input, { density: 300 })
      .resize(size, size)
      .png()
      .toFile(output)
    console.log(`Generated ${output}`)
  }
}

generate().catch(err => {
  console.error(err)
  process.exit(1)
})
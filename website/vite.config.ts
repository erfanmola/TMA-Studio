import { type UserConfig, defineConfig } from 'vite'

import pluginPurgeCss from "@mojojoejo/vite-plugin-purgecss";
import solid from 'vite-plugin-solid'
import solidSvg from 'vite-plugin-solid-svg'

export default defineConfig((config) => {
  const isProduction = config.mode !== 'development';

  return {
    plugins: [
      solid(),
      solidSvg(),
      isProduction ? pluginPurgeCss({
        variables: true,
        keyframes: true,
        content: [
          './src/**/*.tsx',
        ],
        safelist: [
          ':root',
        ],
        defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || []
      }) : '',
    ],
  } as UserConfig
})
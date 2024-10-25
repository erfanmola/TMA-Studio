import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

import { resolve } from 'node:path'
import solid from 'vite-plugin-solid'
import tailwindcss from "tailwindcss";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({
      exclude: [
        'electron-store'
      ]
    })]
  },
  preload: {
    plugins: [externalizeDepsPlugin({
      exclude: [
        'electron-store'
      ]
    })]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [solid()],
    css: {
      postcss: {
        plugins: [
          tailwindcss()
        ]
      }
    }
  },
})

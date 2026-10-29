import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// PWA（可安装 + 离线可学）：
//  - 安装信息在下方 manifest（构建时生成 dist/manifest.webmanifest）
//  - Service Worker 由 vite-plugin-pwa 的 generateSW 生成 dist/sw.js
//    · precache：应用壳与代码产物全量预缓存（见 globPatterns）
//    · 运行时缓存：同源 GET 兜底 NetworkFirst；字体分片走 CacheFirst
//      （Maple 字体 1048 个 woff2 分片约 50MB，不进 precache——按需取过即缓存，
//       首次安装轻量，离线效果等价；想要全量 precache 把 woff2 加进 globPatterns 即可）
//  - 乐器采样仍走 smplr 外部 CDN，不缓存（audio.js 自带合成兜底，断网自动降级）
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      manifest: {
        name: '学音乐',
        short_name: '学音乐',
        description: '边玩边学的互动乐理课',
        lang: 'zh-CN',
        theme_color: '#F2F1EE',
        background_color: '#F2F1EE',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: './icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: './icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,svg,png,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // 字体分片：unicode-range 按需加载，用过即缓存，之后离线可用
            urlPattern: ({ request, url }) =>
              request.method === 'GET' &&
              url.origin === self.location.origin &&
              /\.(woff2?|ttf|otf)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'xyy-fonts',
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // 其余同源 GET 兜底：网络优先，失败回落缓存
            urlPattern: ({ request, url }) =>
              request.method === 'GET' && url.origin === self.location.origin,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'xyy-same-origin',
              expiration: { maxEntries: 256, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
})

# Little Box

<p align="center">
  <img src="docs/figures/hero.png" alt="Little Box" width="720">
</p>

<p align="center">
  <img src="public/images/favicon.svg" alt="Little Box mark" width="88">
</p>

Little Box is a privacy-first conversation workspace for chat, writing, translation, coding help, and document reading. One Vite client runs in the browser, as an installed progressive web app, and inside a Capacitor Android shell. People bring their own model keys. Conversation state and parsed files stay on the device unless a feature explicitly calls the network.

The picture above is the product illustration shipped with this folder. The running client is not a React or Python service. It is the Vite application in this repository, package `littleaibox`, version `3.0.7`. The live site is [littleaibox.com](https://littleaibox.com).

| | |
| --- | --- |
| Package | `littleaibox` `3.0.7` |
| Client | Vite 7 and Tailwind 4 |
| Native shell | Capacitor 7 for Android |
| Local database | IndexedDB `LittleAIBoxDB`, version 2 |
| Default origin | `https://littleaibox.com` |
| Fallback origin | `https://littleaibox.pages.dev` |
| Support | [support@littleaibox.com](mailto:support@littleaibox.com) |
| License | MIT, as stated in [LICENSE](LICENSE) |

```text
npm install
npm run dev
npm run build
```

`predev` and `prebuild` run `scripts/copy-i18n.mjs` before Vite. Put model keys in the application UI. Do not commit them.


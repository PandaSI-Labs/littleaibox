<div align="center">

# LittleAIBox への貢献

**LittleAIBox の改善にご協力いただきありがとうございます！** 🎉

バグレポート、アイデア、コードの行がすべて、このプロジェクトをより良くします。🌱

[中文](CONTRIBUTING.zh-CN.md) | [English](../CONTRIBUTING.md) | [日本語](CONTRIBUTING.ja.md) | [한국어](CONTRIBUTING.ko.md)

</div>

---

## 🚀 クイックスタート（新規貢献者向け）

1. **Fork とクローン**

   ```bash
   git clone https://github.com/diandiancha/LittleAIBox.git
   cd LittleAIBox
   npm install
   npm run dev
   ```

2. **変更を行う** → ローカルでテスト（ターミナルに表示されるポートを確認）

3. **変更をコミット** → `git commit -m "fix: i18n の誤字を修正"`

4. **プッシュして Pull Request を開く**

5. 🎉 完了！できるだけ早くレビューします。

> 💡 *GitHub が初めての場合は、[First Contributions](https://github.com/firstcontributions/first-contributions) を確認してください。*

---

## 🧭 行動規範

親切で、包括的で、建設的であること。

みんなが学んでいる — 他の人の成長を助けましょう。❤️

---

## 💡 貢献方法

- 🐛 **バグの報告** — [Issues](https://github.com/diandiancha/LittleAIBox/issues) 経由
- ✨ **機能の提案** — 新しいアイデアや改善を歓迎
- 📝 **ドキュメントの改善** — 誤字を修正、例を追加
- 🌍 **UI の翻訳** — LittleAIBox を世界中でアクセス可能にする
- 🔧 **コードの提出** — バグ修正、リファクタリング、新機能
- 🏗️ **コードリファクタリングの協力** — 一緒にコードベース構造を改善

---

## 🧑‍💻 開発環境のセットアップ

**要件**
- Node.js ≥ 18
- npm ≥ 9
- Git（最新版）
- VS Code（推奨）

**ローカルで起動**

```bash
npm install
npm run dev
```

**本番ビルド**

```bash
npm run build
```

**モバイルテスト（オプション）**

```bash
npx cap add android
npx cap sync
npx cap open android
```

---

## 🧩 プロジェクト構造

```
LittleAIBox/
├── src/                    # ソースコード
│   ├── main.js            # メインアプリケーションロジック
│   ├── api-config.js      # API 設定
│   ├── db.js              # IndexedDB ラッパー
│   ├── i18n.js            # 国際化
│   ├── mermaid-renderer.js # 図表レンダリング
│   ├── floating-timeline.js # フローティングタイムライン
│   ├── style.css          # グローバルスタイル
│   └── sw-custom.js       # Service Worker
├── public/                 # 静的アセット
│   ├── locales/           # 翻訳ファイル（5言語）
│   ├── libs/              # サードパーティライブラリ
│   ├── images/            # 画像とアイコン
│   └── manifest.webmanifest # PWA マニフェスト
├── appshow/                # 言語別スクリーンショット
├── capacitor.config.json   # モバイルアプリ設定
├── vite.config.js          # ビルド設定
├── package.json            # 依存関係
└── index.html              # メイン HTML エントリーポイント
```

---

## 🧾 コミットとコードスタイル（中上級貢献者向け）

### 💬 従来のコミット

```
<type>(<scope>): <description>
```

**一般的なタイプ**
- `feat` — 新機能
- `fix` — バグ修正
- `docs` — ドキュメント
- `style` — コードフォーマット
- `refactor` — 非破壊的リファクタリング
- `perf` — パフォーマンス改善
- `test` — テスト関連

**例**

```bash
feat(i18n): ポルトガル語翻訳を追加
fix(file): PDF パースエラーを処理
docs(readme): インストール手順を更新
refactor(rag): チャンキングアルゴリズムを最適化
```

### 🧱 コード規約

- **ES6+** 機能を使用
- `async/await` を優先
- `const` と `let` を使用（`var` は避ける）
- 必要に応じて JSDoc で明確なコメントを書く
- 関数を短く、焦点を絞って保つ

### 📝 コード例

```javascript
// 良い例
async function handleFileUpload(file) {
  if (!file) return;
  
  const isValid = validateFile(file);
  if (!isValid) {
    showToast('無効なファイル形式');
    return;
  }
  
  try {
    const content = await parseFile(file);
    await processContent(content);
  } catch (error) {
    console.error('ファイル処理中にエラー:', error);
    showToast('ファイル処理に失敗しました');
  }
}
```

---

## 🔄 Pull Request プロセス

1. **フォークを同期**
   ```bash
   git fetch upstream
   git merge upstream/main
   ```

2. **ブランチを作成**
   ```bash
   git checkout -b feature/私の機能
   ```

3. **変更をテスト** — 可能であれば複数のブラウザでテスト

4. **プッシュして PR を開く**

**Pull Request テンプレート**

```markdown
## 説明
この変更が何をするか、なぜか。

## タイプ
- [ ] バグ修正
- [ ] 新機能
- [ ] ドキュメント
- [ ] 翻訳

## テスト
これらの変更をテストする方法：
1. ステップ1
2. ステップ2

## チェックリスト
- [ ] コードがスタイルガイドに準拠
- [ ] テスト済みで動作中
- [ ] 新しい警告なし
- [ ] ドキュメントを更新
```

---

## 🐛 バグの報告

提出前に：
1. 既存の [Issues](https://github.com/diandiancha/LittleAIBox/issues) を検索
2. ブラウザコンソールのエラーを確認
3. 異なるブラウザ/デバイスで再現を試す

**バグレポートテンプレート**

```markdown
**バグの説明**
バグの明確な説明。

**再現方法**
再現手順：
1. '...' に移動
2. '....' をクリック
3. エラーを確認

**期待される動作**
期待していたこと。

**環境**
- OS: [例: Windows 11]
- Browser: [例: Chrome 120]
- Device: [例: デスクトップ、モバイル]
- Version: [例: 2.3.1]
```

---

## 💡 機能の提案

提案前の考慮事項：
- プロジェクトのビジョンと一致するか（プライバシー重視、ローカル処理）？
- クライアントサイド専用として実現可能か？
- 多くのユーザーの利益になるか？

**機能リクエストテンプレート**

```markdown
**機能概要**
提案された機能の簡単な説明。

**問題説明**
何を解決するか？誰が利益を得るか？

**提案された解決策**
この機能はどのように機能するか？

**考慮された代替案**
他にどんなアプローチを考えましたか？
```

---

## 🌐 翻訳

サポート言語：
- 🇨🇳 簡体字中国語 (zh-CN)
- 🇹🇼 繁体字中国語 (zh-TW)
- 🇬🇧 英語 (en)
- 🇯🇵 日本語 (ja)
- 🇰🇷 韓国語 (ko)

**新言語の追加**

```bash
cp public/locales/en.json public/locales/あなたの言語.json
```

値を編集し、キーを同じに保ち、`src/i18n.js` に言語コードを追加：

```javascript
const SUPPORTED_LANGUAGES = ['zh-CN', 'en', 'ja', 'ko', 'zh-TW', 'あなたの言語'];
```

テスト：`npm run dev` → 設定で言語を切り替え → すべての UI 要素が翻訳されていることを確認。

---

## 🆘 ヘルプが必要ですか？

- [README](README.ja.md) を読む
- [Issues](https://github.com/diandiancha/LittleAIBox/issues) を確認
- [Discussions](https://github.com/diandiancha/LittleAIBox/discussions) で質問
- `question` ラベルで Issue を開く

忍耐してください — 私は学生で時間が限られています。🙏

---

## 🎓 学習リソース

オープンソースや Web 開発が初めてですか？

**一般的**
- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [オープンソースへの貢献方法](https://opensource.guide/how-to-contribute/)
- [First Contributions](https://github.com/firstcontributions/first-contributions)

**使用技術**
- [Vanilla JavaScript](https://developer.mozilla.org/ja/docs/Web/JavaScript)
- [Vite](https://vitejs.dev/)
- [Capacitor](https://capacitorjs.com/docs)
- [IndexedDB](https://developer.mozilla.org/ja/docs/Web/API/IndexedDB_API)
- [Service Workers](https://developer.mozilla.org/ja/docs/Web/API/Service_Worker_API)

**コード品質とリファクタリング**
- [Refactoring.guru](https://refactoring.guru/) — リファクタリングパターンを学ぶ
- [Clean Code](https://github.com/ryanmcdermott/clean-code-javascript) — JavaScript ベストプラクティス
- [モジュールパターン](https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide/Modules) — ES モジュールガイド

---

## 🙌 謝辞

すべての貢献者は **Contributors ページ**にリストされ、**リリースノート**で紹介されます。

LittleAIBox をより良くしていただきありがとうございます！🚀

---

**覚えておいてください**：学生開発者として、皆様の貢献と忍耐に心から感謝しています。一緒に素晴らしいものを構築しましょう！💪

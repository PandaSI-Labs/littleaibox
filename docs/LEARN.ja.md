# LittleAIBox 学習ガイド

**学生が学生のために作成した学習ガイド。**

こんにちは！👋 私は学生開発者で、学習プロジェクトとして LittleAIBox を構築しました。このガイドでは、学習の過程で学んだことを共有します。一緒に成長しましょう！

[中文](LEARN.zh-CN.md) | [English](../LEARN.md) | [日本語](LEARN.ja.md) | [한국어](LEARN.ko.md)

> 🎓 このプロジェクトは教育および研究目的で開発されています。  
> 🤝 私たちは皆、一緒に学習しています - 素晴らしいものを一緒に構築しましょう！

---

## 📚 目次

- [クイックスタート](#クイックスタート)
- [コアコンセプト](#コアコンセプト)
- [アーキテクチャとパターン](#アーキテクチャとパターン)
- [主要技術](#主要技術)
- [実践チュートリアル](#実践チュートリアル)
- [よくある課題](#よくある課題)
- [次のステップ](#次のステップ)

---

## 🚀 クイックスタート

### 前提条件

始める前に、以下を用意してください：
- **Node.js 18+** - [ダウンロード](https://nodejs.org/)
- **基礎 JavaScript** - ES6+ に慣れ親しむ
- **Git** - バージョン管理の基礎
- **VS Code** (推奨) - 無料コードエディタ

### 最初のステップ

```bash
# 1. リポジトリをクローン
git clone https://github.com/diandiancha/LittleAIBox.git
cd LittleAIBox

# 2. 依存関係をインストール
npm install

# 3. 開発サーバーを起動
npm run dev

# 4. ブラウザで開く
# ターミナルに表示される URL にアクセス（通常は http://localhost:5173）
```

**🎉 おめでとうございます！** これで LittleAIBox がローカルで動作しています。

---

## 🧠 コアコンセプト

### 1. **バニラ JavaScript（フレームワークなし）**

LittleAIBox は React、Vue、Angular **なしで** 構築されています。なぜ？

**利点：**
- ✅ フレームワークオーバーヘッドゼロ - ネイティブ JavaScript を学ぶ
- ✅ より良いパフォーマンス - 仮想 DOM なし、追加レイヤーなし
- ✅ 完全な制御 - すべてのコード行を理解する
- ✅ より小さなバンドルサイズ - より速い読み込み

**キーパターン：ES モジュール**
```javascript
// 別のモジュールからインポート
import { applyLanguage, t } from './i18n.js';

// 他のモジュールにエクスポート
export function showToast(message, type) {
  // 実装
}
```

### 2. **クライアントサイドファイル処理**

最も印象的な機能の 1 つ：Office ファイルを**ブラウザで** 解析。

**動作方法：**
```javascript
// PDF.js で PDF を解析
const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
const page = await pdf.getPage(1);
const textContent = await page.getTextContent();

// mammoth.js で DOCX を解析
const result = await mammoth.convertToHtml({ arrayBuffer });
```

**重要な洞察：** ファイルは**決して**サーバーにアップロードされません。すべてローカルで行われます！

### 3. **プログレッシブ Web アプリ（PWA）**

Web アプリをネイティブアプリのように感じさせます。

**コンポーネント：**
- **Service Worker** - オフラインサポート用のバックグラウンドスクリプト
- **Manifest** - アプリのメタデータとアイコン
- **IndexedDB** - ローカルデータベースストレージ

**例：Service Worker**
```javascript
// sw-custom.js
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    // API レスポンスをキャッシュ
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
```

### 4. **RAG（検索拡張生成）**

ドキュメント分析を可能にする AI の魔法。

**プロセス：**
1. **アップロード** - ユーザーが PDF/DOCX ファイルをアップロード
2. **解析** - ブラウザでテキストを抽出
3. **チャンク** - 管理可能な部分に分割
4. **検索** - クエリに基づいて関連チャンクを検索
5. **生成** - AI がコンテキストを使用して回答

**スマートチャンキング例：**
```javascript
function smartChunking(text, maxSize = 8000, overlap = 200) {
  const sentences = text.match(/[^。！？\.\!\?]+[。！？\.\!\?\n\n]*/g) || [];
  const chunks = [];
  let currentChunk = "";
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxSize) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  return chunks;
}
```

### 5. **国際化（i18n）**

クリーンパターンで 5 つの言語をサポート。

**構造：**
```json
// public/locales/ja.json
{
  "chat": {
    "placeholder": "メッセージを入力...",
    "send": "送信"
  }
}
```

**使用：**
```javascript
import { t, applyLanguage } from './i18n.js';

// 翻訳
const message = t('chat.placeholder');
// 表示：「メッセージを入力...」

// 言語切替
await applyLanguage('en');
```

---

## 🏗️ アーキテクチャとパターン

### プロジェクト構造

```
LittleAIBox/
├── src/                      # ソースコード
│   ├── main.js              # メインアプリケーションロジック - UI、チャット、ファイル処理を担当
│   ├── db.js                # IndexedDB ラッパー - ローカルデータベースを管理
│   ├── i18n.js              # 国際化 - 言語切替
│   ├── mermaid-renderer.js  # 図表レンダリング - フローチャートとグラフをレンダリング
│   ├── floating-timeline.js # フローティングタイムライン
│   ├── api-config.js        # API 設定 - Gemini API セットアップ
│   ├── style.css            # グローバルスタイル
│   └── sw-custom.js         # Service Worker - PWA オフラインサポート
├── public/                   # 静的アセット
│   ├── locales/             # 翻訳ファイル（5 言語）
│   ├── libs/                # サードパーティライブラリ（mammoth、pdf.js など）
│   ├── images/              # 画像とアイコン
│   └── manifest.webmanifest # PWA マニフェスト
├── docs/                     # 多言語ドキュメント
├── appshow/                  # 言語別スクリーンショット
├── capacitor.config.json     # モバイルアプリ構成
├── vite.config.js            # ビルド構成
├── package.json              # 依存関係
└── index.html                # メイン HTML エントリーポイント
```

**構造の理解：**
- **src/** - すべての JavaScript コードがここにあります。アプリの流れを理解するには `main.js` から始めましょう。
- **public/** - 直接提供される静的ファイル。アセットフォルダと考えてください。
- **docs/** - ドキュメントファイル（これみたいに！）

### 使用されるデザインパターン

1. **モジュールパターン**
   - ES6 モジュールによるカプセル化
   - 各ファイルが 1 つの懸念事項を処理

2. **オブザーバーパターン**
   - UI インタラクションのイベントリスナー
   - fetch イベントに応答する Service Worker

3. **ファクトリーパターン**
   - 動的スクリプト読み込み
   - リソースキャッシング

4. **ストラテジーパターン**
   - PDF/DOCX/PPTX 用の異なるファイルパーサー
   - 複数のキャッシング戦略

### ステート管理

Redux/Vuex は不要！シンプルなパターンを使用：

```javascript
// グローバルステート
let chats = {};
let currentChatId = null;
let attachments = [];

// ステートを更新する関数
function addMessage(chatId, message) {
  if (!chats[chatId]) chats[chatId] = { messages: [] };
  chats[chatId].messages.push(message);
  renderChat(chatId); // UI を更新
}
```

---

## 🛠️ 主要技術

### ビルドツール

**Vite** - 超高速開発サーバー
```json
{
  "scripts": {
    "dev": "vite",           // 開発サーバーを起動
    "build": "vite build"    // 本番ビルド
  }
}
```

**なぜ Vite？**
- ✅ 即座のサーバー起動
- ✅ ホットモジュール置換（HMR）
- ✅ 最適化された本番ビルド

### スタイリング

**Tailwind CSS** - ユーティリティファースト CSS フレームワーク
```html
<div class="flex items-center justify-between bg-blue-500 p-4">
  <button class="px-4 py-2 rounded hover:bg-blue-600">
    クリック
  </button>
</div>
```

**利点：**
- ✅ カスタム CSS ファイルのメンテナンス不要
- ✅ 一貫したデザインシステム
- ✅ レスポンシブユーティリティ内蔵

### ブラウザ API

**IndexedDB** - クライアントサイドデータベース
```javascript
import { getDb } from './db.js';

const db = await getDb();
const transaction = db.transaction(['chats'], 'readwrite');
const store = transaction.objectStore('chats');
await store.put({ userId: '123', chatsData: data });
```

**Service Worker** - オフラインサポート
- 静的アセットをキャッシュ
- ネットワークリクエストをインターセプト
- バックグラウンド同期

**Fetch API** - モダンなネットワーク
```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'こんにちは' })
});
```

### ライブラリ

| ライブラリ | 目的 | なぜ？ |
|---------|---------|------|
| **marked.js** | Markdown 解析 | 軽量、高速 |
| **highlight.js** | コード構文ハイライト | 40+ 言語 |
| **KaTeX** | 数式レンダリング | 美しい方程式 |
| **Mermaid** | 図表生成 | フローチャート、グラフ |
| **PDF.js** | PDF 解析 | Mozilla の実証済み |
| **mammoth.js** | DOCX 解析 | HTML に変換 |
| **Capacitor** | ネイティブモバイル | クロスプラットフォーム |

---

## 🎓 実践チュートリアル

### チュートリアル 1：新機能の追加

「ダークモード」トグルボタンを追加しましょう！

**ステップ 1：UI ボタンを追加**
```html
<!-- index.html -->
<button id="theme-toggle" class="btn">🌙 ダークモード</button>
```

**ステップ 2：JavaScript ロジックを追加**
```javascript
// src/main.js
elements.themeToggle = document.getElementById('theme-toggle');
elements.themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', 
    document.body.classList.contains('dark'));
});
```

**ステップ 3：CSS を追加**
```css
/* Tailwind が自動で処理します！*/
/* またはカスタムスタイルを追加 */
.dark {
  background: #1a1a1a;
  color: #ffffff;
}
```

**ステップ 4：読み込み時に保持**
```javascript
// ページ読み込み時にダークモードを復元
if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark');
}
```

### チュートリアル 2：ファイル解析

シンプルな画像ビューアを作成しましょう：

```javascript
async function viewImage(file) {
  // ファイルタイプをチェック
  if (!file.type.startsWith('image/')) {
    alert('画像ファイルを選択してください');
    return;
  }
  
  // base64 として読み込む
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.createElement('img');
    img.src = e.target.result;
    document.body.appendChild(img);
  };
  reader.readAsDataURL(file);
}

// 使用
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) viewImage(file);
});
```

### チュートリアル 3：i18n サポートの追加

新しい言語サポートを追加（例：スペイン語）：

**ステップ 1：翻訳ファイルを作成**
```bash
cp public/locales/en.json public/locales/es.json
```

**ステップ 2：翻訳**
```json
{
  "chat": {
    "placeholder": "Escribe tu mensaje...",
    "send": "Enviar"
  }
}
```

**ステップ 3：i18n.js を更新**
```javascript
const SUPPORTED_LANGUAGES = ['zh-CN', 'en', 'ja', 'ko', 'zh-TW', 'es'];
```

**ステップ 4：言語セレクターを追加**
```html
<select id="lang-select">
  <option value="ja">日本語</option>
  <option value="es">Español</option>
</select>
```

---

## 💡 よくある課題

### 課題 1：「どこから始めればよいですか？」

**コードベース：**
LittleAIBox は学習プロジェクトとして始まったため、`main.js` にほとんどのアプリロジックが 1 つのファイルに含まれています。素晴らしく動作していますが、一緒に機能を追加していくにつれ、より小さなモジュールに分割することで、全員の役に立ちます。

**学習機会：** リファクタリングに興味があるなら、探索できる潜在的な構造があります：
```
src/
├── chat/
│   ├── index.js           # チャットロジック
│   ├── messages.js        # メッセージ処理
│   └── streaming.js       # ストリーミングレスポンス
├── files/
│   ├── parser.js          # ファイル解析
│   └── preview.js         # ファイルプレビュー
└── ui/
    ├── sidebar.js         # サイドバー UI
    └── theme.js           # テーマ管理
```

**協力を歓迎！** コードベース構造の改善を手伝いたいなら、それは貢献し学習する完璧な方法です！

### 課題 2：「デバッグ方法は？」

**ブラウザ DevTools：**
- `F12` - DevTools を開く
- `Console` タブ - ログとエラーを表示
- `Network` タブ - API リクエストをチェック
- `Application` タブ - IndexedDB、localStorage を検 inspect

**デバッグのヒント：**
```javascript
// ブレークポイントを追加
debugger; // 実行がここで停止

// コンソールログ
console.log('変数:', variable);
console.table(arrayData); // 素敵なテーブルビュー
console.group('セクション'); // ログをグループ化
```

### 課題 3：「非同期コードの処理」

**よくある落とし穴：**
```javascript
// ❌ 間違い：await がない
function fetchData() {
  const data = fetch('/api/data');
  console.log(data); // Promise、実際のデータではない！
}

// ✅ 正しい
async function fetchData() {
  const response = await fetch('/api/data');
  const data = await response.json();
  console.log(data); // 実際のデータ！
}
```

**エラー処理：**
```javascript
try {
  const result = await riskyOperation();
} catch (error) {
  console.error('エラーが発生しました：', error);
  showToast('問題が発生しました', 'error');
}
```

### 課題 4：「パフォーマンスの問題」

**最適化戦略：**

1. **遅延読み込み**
```javascript
// 必要な時だけ重いライブラリを読み込む
async function loadLibrary() {
  if (!window.heavyLibrary) {
    await loadScript('/libs/heavy-library.js');
  }
  return window.heavyLibrary;
}
```

2. **デバウンス**
```javascript
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 使用：検索入力をデバウンス
const debouncedSearch = debounce(handleSearch, 300);
```

3. **仮想スクロール**
長いリストの場合、表示されている項目のみレンダリング。

---

## 📖 学習リソース

### JavaScript 基礎

- [MDN JavaScript ガイド](https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide) - 公式ドキュメント
- [JavaScript.info](https://ja.javascript.info/) - モダンチュートリアル
- [You Don't Know JS](https://github.com/getify/You-Dont-Know-JS) - ディープダイブシリーズ

### Web API

- [MDN Web API](https://developer.mozilla.org/ja/docs/Web/API) - すべてのブラウザ API
- [IndexedDB](https://developer.mozilla.org/ja/docs/Web/API/IndexedDB_API) - クライアントサイドデータベース
- [Service Workers](https://developer.mozilla.org/ja/docs/Web/API/Service_Worker_API) - オフラインサポート

### ビルドツールとフレームワーク

- [Vite ドキュメント](https://ja.vitejs.dev/) - ビルドツールドキュメント
- [Tailwind CSS](https://tailwindcss.com/docs) - ユーティリティファースト CSS
- [Capacitor](https://capacitorjs.com/docs) - クロスプラットフォームアプリ

### AI と機械学習

- [Google Gemini API](https://ai.google.dev/docs) - API ドキュメント
- [RAG コンセプト](https://www.pinecone.io/learn/retrieval-augmented-generation/) - RAG を学ぶ
- [LangChain](https://js.langchain.com/docs/) - LLM フレームワーク

---

## 🎯 次のステップ

### 初心者パス

1. ✅ プロジェクトをクローンして実行
2. ✅ `CONTRIBUTING.md` を読む - 貢献方法を学ぶ
3. ✅ 小さなバグを修正 - 自信をつける
4. ✅ 新しい翻訳を追加 - i18n を実践
5. ✅ 最初の PR を送信！

### 中級パス

1. ✅ アーキテクチャを理解
2. ✅ 新しいファイル形式パーサーを追加
3. ✅ 新機能を実装
4. ✅ 既存コードを最適化
5. ✅ テストを書く

### 上級パス

1. ✅ `main.js` をモジュールにリファクタリング（一緒にやりましょう！）
2. ✅ パフォーマンスを最適化
3. ✅ 新しい AI 機能を追加
4. ✅ 独自の機能を構築
5. ✅ 他の貢献者をメンター

---

## 🤝 一緒に学ぼう

**私たちは皆、ここで学習しています！**

学生開発者として、モダンな Web 開発を学ぶためにこのプロジェクトを構築しました。私たちは皆、この旅路を共にしています。気軽に：

- 💬 [ディスカッション](https://github.com/diandiancha/LittleAIBox/discussions) - 質問、アイデアを共有
- 🐛 [課題](https://github.com/diandiancha/LittleAIBox/issues) - バグを報告、改善を提案
- 📖 [ドキュメント](CONTRIBUTING.ja.md) - 貢献方法を学ぶ

**覚えておいてください：**
> 私たちは皆、一緒に学習しています。すべての貢献は、大きくても小さくても、私たち全員の成長に役立ちます。  
> 質問をためらわないでください - お互いを助け合うためにここにいます！

---

## 🎓 学習チェックリスト

進捗を追跡：

- [ ] 開発環境をセットアップ
- [ ] プロジェクトを正常に実行
- [ ] プロジェクト構造を理解
- [ ] main.js を読む
- [ ] 最初のコード変更を行う
- [ ] 最初の PR を送信
- [ ] 他の貢献者を助ける
- [ ] 何か新しいものを構築

---

**学習を始める準備はできましたか？** 🚀

> リポジトリを Fork し、ローカルにクローンして、探索を始めてください。学習する最良の方法は実践することです！

**質問はありますか？** [ディスカッション](https://github.com/diandiancha/LittleAIBox/discussions) を開く - サポートします！

---

**楽しい学習を！** 📚✨


# LittleAIBox 학습 가이드

**학생이 학생을 위해 만든 학습 가이드。**

안녕하세요！👋 저는 학생 개발자이며, 학습 프로젝트로서 LittleAIBox를 구축했습니다. 이 가이드는 학습 과정에서 배운 내용을 공유합니다. 함께 성장합시다！

[中文](LEARN.zh-CN.md) | [English](../LEARN.md) | [日本語](LEARN.ja.md) | [한국어](LEARN.ko.md)

> 🎓 이 프로젝트는 교육 및 연구 목적으로 개발되었습니다。  
> 🤝 우리는 모두 함께 학습하고 있습니다 - 멋진 것을 함께 구축합시다！

---

## 📚 목차

- [빠른 시작](#빠른-시작)
- [핵심 개념](#핵심-개념)
- [아키텍처와 패턴](#아키텍처와-패턴)
- [주요 기술](#주요-기술)
- [실습 튜토리얼](#실습-튜토리얼)
- [일반적인 도전 과제](#일반적인-도전-과제)
- [다음 단계](#다음-단계)

---

## 🚀 빠른 시작

### 사전 요구사항

시작하기 전에 다음을 준비하세요：
- **Node.js 18+** - [다운로드](https://nodejs.org/)
- **기본 JavaScript** - ES6+ 사용에 익숙함
- **Git** - 버전 관리 기본 사항
- **VS Code** (권장) - 무료 코드 편집기

### 첫 단계

```bash
# 1. 저장소 클론
git clone https://github.com/diandiancha/LittleAIBox.git
cd LittleAIBox

# 2. 종속성 설치
npm install

# 3. 개발 서버 시작
npm run dev

# 4. 브라우저에서 열기
# 터미널에 표시된 URL 방문 (일반적으로 http://localhost:5173)
```

**🎉 축하합니다！** 이제 LittleAIBox가 로컬에서 실행 중입니다.

---

## 🧠 핵심 개념

### 1. **바닐라 JavaScript (프레임워크 없음)**

LittleAIBox는 React, Vue 또는 Angular **없이** 구축되었습니다. 왜?

**이점：**
- ✅ 프레임워크 오버헤드 제로 - 네이티브 JavaScript 학습
- ✅ 더 나은 성능 - 가상 DOM 없음, 추가 레이어 없음
- ✅ 완전한 제어 - 모든 코드 라인 이해
- ✅ 더 작은 번들 크기 - 더 빠른 로딩

**주요 패턴：ES 모듈**
```javascript
// 다른 모듈에서 가져오기
import { applyLanguage, t } from './i18n.js';

// 다른 모듈에 내보내기
export function showToast(message, type) {
  // 구현
}
```

### 2. **클라이언트 사이드 파일 처리**

가장 인상적인 기능 중 하나：Office 파일을 **브라우저에서** 파싱。

**작동 방식：**
```javascript
// PDF.js로 PDF 파싱
const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
const page = await pdf.getPage(1);
const textContent = await page.getTextContent();

// mammoth.js로 DOCX 파싱
const result = await mammoth.convertToHtml({ arrayBuffer });
```

**핵심 통찰：** 파일은 **절대** 서버에 업로드되지 않습니다. 모든 것이 로컬에서 발생합니다！

### 3. **프로그레시브 웹 앱 (PWA)**

웹 앱을 네이티브 앱처럼 느끼게 만듭니다.

**구성 요소：**
- **Service Worker** - 오프라인 지원을 위한 백그라운드 스크립트
- **Manifest** - 앱 메타데이터 및 아이콘
- **IndexedDB** - 로컬 데이터베이스 저장소

**예시：Service Worker**
```javascript
// sw-custom.js
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    // API 응답 캐싱
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
```

### 4. **RAG (검색 증강 생성)**

문서 분석을 가능하게 하는 AI 마법。

**프로세스：**
1. **업로드** - 사용자가 PDF/DOCX 파일 업로드
2. **파싱** - 브라우저에서 텍스트 추출
3. **청크** - 관리 가능한 조각으로 분할
4. **검색** - 쿼리 기반으로 관련 청크 찾기
5. **생성** - AI가 컨텍스트를 사용하여 답변

**스마트 청킹 예시：**
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

### 5. **국제화 (i18n)**

깔끔한 패턴으로 5개 언어 지원。

**구조：**
```json
// public/locales/ko.json
{
  "chat": {
    "placeholder": "메시지를 입력하세요...",
    "send": "보내기"
  }
}
```

**사용：**
```javascript
import { t, applyLanguage } from './i18n.js';

// 번역
const message = t('chat.placeholder');
// 표시：「메시지를 입력하세요...」

// 언어 전환
await applyLanguage('en');
```

---

## 🏗️ 아키텍처와 패턴

### 프로젝트 구조

```
LittleAIBox/
├── src/                      # 소스 코드
│   ├── main.js              # 메인 애플리케이션 로직 - UI, 채팅, 파일 처리 담당
│   ├── db.js                # IndexedDB 래퍼 - 로컬 데이터베이스 관리
│   ├── i18n.js              # 국제화 - 언어 전환
│   ├── mermaid-renderer.js  # 다이어그램 렌더링 - 플로우차트 및 그래프 렌더링
│   ├── floating-timeline.js # 플로팅 타임라인
│   ├── api-config.js        # API 설정 - Gemini API 설정
│   ├── style.css            # 전역 스타일
│   └── sw-custom.js         # Service Worker - PWA 오프라인 지원
├── public/                   # 정적 자산
│   ├── locales/             # 번역 파일 (5개 언어)
│   ├── libs/                # 서드파티 라이브러리 (mammoth, pdf.js 등)
│   ├── images/              # 이미지 및 아이콘
│   └── manifest.webmanifest # PWA 매니페스트
├── docs/                     # 다국어 문서
├── appshow/                  # 언어별 스크린샷
├── capacitor.config.json     # 모바일 앱 구성
├── vite.config.js            # 빌드 구성
├── package.json              # 종속성
└── index.html                # 메인 HTML 진입점
```

**구조 이해：**
- **src/** - 모든 JavaScript 코드가 여기에 있습니다. 앱 흐름을 이해하려면 `main.js`부터 시작하세요.
- **public/** - 직접 제공되는 정적 파일. 자산 폴더라고 생각하세요.
- **docs/** - 문서 파일 (이것처럼！)

### 사용되는 디자인 패턴

1. **모듈 패턴**
   - ES6 모듈로 캡슐화
   - 각 파일이 하나의 관심사 처리

2. **관찰자 패턴**
   - UI 상호작용을 위한 이벤트 리스너
   - fetch 이벤트에 응답하는 Service Worker

3. **팩토리 패턴**
   - 동적 스크립트 로딩
   - 리소스 캐싱

4. **전략 패턴**
   - PDF/DOCX/PPTX용 다른 파일 파서
   - 여러 캐싱 전략

### 상태 관리

Redux/Vuex 불필요！간단한 패턴 사용：

```javascript
// 전역 상태
let chats = {};
let currentChatId = null;
let attachments = [];

// 상태 업데이트 함수
function addMessage(chatId, message) {
  if (!chats[chatId]) chats[chatId] = { messages: [] };
  chats[chatId].messages.push(message);
  renderChat(chatId); // UI 업데이트
}
```

---

## 🛠️ 주요 기술

### 빌드 도구

**Vite** - 초고속 개발 서버
```json
{
  "scripts": {
    "dev": "vite",           // 개발 서버 시작
    "build": "vite build"    // 프로덕션 빌드
  }
}
```

**왜 Vite？**
- ✅ 즉각적인 서버 시작
- ✅ 핫 모듈 교체 (HMR)
- ✅ 최적화된 프로덕션 빌드

### 스타일링

**Tailwind CSS** - 유틸리티 우선 CSS 프레임워크
```html
<div class="flex items-center justify-between bg-blue-500 p-4">
  <button class="px-4 py-2 rounded hover:bg-blue-600">
    클릭
  </button>
</div>
```

**이점：**
- ✅ 사용자 정의 CSS 파일 유지보수 불필요
- ✅ 일관된 디자인 시스템
- ✅ 반응형 유틸리티 내장

### 브라우저 API

**IndexedDB** - 클라이언트 사이드 데이터베이스
```javascript
import { getDb } from './db.js';

const db = await getDb();
const transaction = db.transaction(['chats'], 'readwrite');
const store = transaction.objectStore('chats');
await store.put({ userId: '123', chatsData: data });
```

**Service Worker** - 오프라인 지원
- 정적 자산 캐싱
- 네트워크 요청 가로채기
- 백그라운드 동기화

**Fetch API** - 모던 네트워킹
```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '안녕하세요' })
});
```

### 라이브러리

| 라이브러리 | 목적 | 이유？ |
|---------|---------|------|
| **marked.js** | Markdown 파싱 | 가볍고 빠름 |
| **highlight.js** | 코드 구문 강조 | 40+ 언어 지원 |
| **KaTeX** | 수식 렌더링 | 아름다운 방정식 |
| **Mermaid** | 다이어그램 생성 | 플로우차트, 그래프 |
| **PDF.js** | PDF 파싱 | Mozilla 검증 |
| **mammoth.js** | DOCX 파싱 | HTML로 변환 |
| **Capacitor** | 네이티브 모바일 | 크로스 플랫폼 |

---

## 🎓 실습 튜토리얼

### 튜토리얼 1：새 기능 추가

"다크 모드" 토글 버튼을 추가해봅시다！

**1단계：UI 버튼 추가**
```html
<!-- index.html -->
<button id="theme-toggle" class="btn">🌙 다크 모드</button>
```

**2단계：JavaScript 로직 추가**
```javascript
// src/main.js
elements.themeToggle = document.getElementById('theme-toggle');
elements.themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('darkMode', 
    document.body.classList.contains('dark'));
});
```

**3단계：CSS 추가**
```css
/* Tailwind가 자동으로 처리합니다！*/
/* 또는 사용자 정의 스타일 추가 */
.dark {
  background: #1a1a1a;
  color: #ffffff;
}
```

**4단계：로드 시 지속**
```javascript
// 페이지 로드 시 다크 모드 복원
if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark');
}
```

### 튜토리얼 2：파일 파싱

간단한 이미지 뷰어를 만들어봅시다：

```javascript
async function viewImage(file) {
  // 파일 타입 확인
  if (!file.type.startsWith('image/')) {
    alert('이미지 파일을 선택하세요');
    return;
  }
  
  // base64로 읽기
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.createElement('img');
    img.src = e.target.result;
    document.body.appendChild(img);
  };
  reader.readAsDataURL(file);
}

// 사용
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) viewImage(file);
});
```

### 튜토리얼 3：i18n 지원 추가

새 언어 지원 추가 (예：스페인어)：

**1단계：번역 파일 생성**
```bash
cp public/locales/en.json public/locales/es.json
```

**2단계：번역**
```json
{
  "chat": {
    "placeholder": "Escribe tu mensaje...",
    "send": "Enviar"
  }
}
```

**3단계：i18n.js 업데이트**
```javascript
const SUPPORTED_LANGUAGES = ['zh-CN', 'en', 'ja', 'ko', 'zh-TW', 'es'];
```

**4단계：언어 선택기 추가**
```html
<select id="lang-select">
  <option value="ko">한국어</option>
  <option value="es">Español</option>
</select>
```

---

## 💡 일반적인 도전 과제

### 도전 과제 1：「어디서 시작해야 하나요？」

**코드베이스：**
LittleAIBox는 학습 프로젝트로서 시작되었기 때문에 `main.js`에 대부분의 앱 로직이 한 파일에 포함되어 있습니다. 훌륭하게 작동하지만, 함께 기능을 추가하면서 더 작은 모듈로 분할하면 모두에게 도움이 됩니다.

**학습 기회：** 리팩토링에 관심이 있다면, 탐색할 수 있는 잠재적 구조입니다：
```
src/
├── chat/
│   ├── index.js           # 채팅 로직
│   ├── messages.js        # 메시지 처리
│   └── streaming.js       # 스트리밍 응답
├── files/
│   ├── parser.js          # 파일 파싱
│   └── preview.js         # 파일 미리보기
└── ui/
    ├── sidebar.js         # 사이드바 UI
    └── theme.js           # 테마 관리
```

**협력 환영！** 코드베이스 구조 개선을 돕고 싶다면, 그것은 기여하고 학습하는 완벽한 방법입니다！

### 도전 과제 2：「디버깅 방법은？」

**브라우저 DevTools：**
- `F12` - DevTools 열기
- `Console` 탭 - 로그 및 오류 보기
- `Network` 탭 - API 요청 확인
- `Application` 탭 - IndexedDB, localStorage 검사

**디버깅 팁：**
```javascript
// 중단점 추가
debugger; // 실행이 여기서 중지됩니다

// 콘솔 로깅
console.log('변수:', variable);
console.table(arrayData); // 깔끔한 테이블 뷰
console.group('섹션'); // 로그 그룹화
```

### 도전 과제 3：「비동기 코드 처리」

**일반적인 함정：**
```javascript
// ❌ 잘못됨：await 누락
function fetchData() {
  const data = fetch('/api/data');
  console.log(data); // Promise, 실제 데이터가 아님！
}

// ✅ 올바름
async function fetchData() {
  const response = await fetch('/api/data');
  const data = await response.json();
  console.log(data); // 실제 데이터！
}
```

**오류 처리：**
```javascript
try {
  const result = await riskyOperation();
} catch (error) {
  console.error('오류 발생:', error);
  showToast('문제가 발생했습니다', 'error');
}
```

### 도전 과제 4：「성능 문제」

**최적화 전략：**

1. **지연 로딩**
```javascript
// 필요한 경우에만 무거운 라이브러리 로드
async function loadLibrary() {
  if (!window.heavyLibrary) {
    await loadScript('/libs/heavy-library.js');
  }
  return window.heavyLibrary;
}
```

2. **디바운싱**
```javascript
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 사용：검색 입력 디바운싱
const debouncedSearch = debounce(handleSearch, 300);
```

3. **가상 스크롤링**
긴 목록의 경우 보이는 항목만 렌더링。

---

## 📖 학습 리소스

### JavaScript 기초

- [MDN JavaScript 가이드](https://developer.mozilla.org/ko/docs/Web/JavaScript/Guide) - 공식 문서
- [JavaScript.info](https://ko.javascript.info/) - 모던 튜토리얼
- [You Don't Know JS](https://github.com/getify/You-Dont-Know-JS) - 심층 다이브 시리즈

### Web API

- [MDN Web API](https://developer.mozilla.org/ko/docs/Web/API) - 모든 브라우저 API
- [IndexedDB](https://developer.mozilla.org/ko/docs/Web/API/IndexedDB_API) - 클라이언트 사이드 데이터베이스
- [Service Workers](https://developer.mozilla.org/ko/docs/Web/API/Service_Worker_API) - 오프라인 지원

### 빌드 도구 및 프레임워크

- [Vite 문서](https://ko.vitejs.dev/) - 빌드 도구 문서
- [Tailwind CSS](https://tailwindcss.com/docs) - 유틸리티 우선 CSS
- [Capacitor](https://capacitorjs.com/docs) - 크로스 플랫폼 앱

### AI 및 머신 러닝

- [Google Gemini API](https://ai.google.dev/docs) - API 문서
- [RAG 개념](https://www.pinecone.io/learn/retrieval-augmented-generation/) - RAG 학습
- [LangChain](https://js.langchain.com/docs/) - LLM 프레임워크

---

## 🎯 다음 단계

### 초급 경로

1. ✅ 프로젝트 클론 및 실행
2. ✅ `CONTRIBUTING.md` 읽기 - 기여 방법 학습
3. ✅ 작은 버그 수정 - 자신감 구축
4. ✅ 새 번역 추가 - i18n 연습
5. ✅ 첫 PR 제출！

### 중급 경로

1. ✅ 아키텍처 이해
2. ✅ 새 파일 형식 파서 추가
3. ✅ 새 기능 구현
4. ✅ 기존 코드 최적화
5. ✅ 테스트 작성

### 고급 경로

1. ✅ `main.js`를 모듈로 리팩토링 (함께 합시다！)
2. ✅ 성능 최적화
3. ✅ 새 AI 기능 추가
4. ✅ 자신만의 기능 구축
5. ✅ 다른 기여자 멘토링

---

## 🤝 함께 학습하기

**우리는 모두 여기서 학습하고 있습니다！**

학생 개발자로서, 모던 웹 개발을 배우기 위해 이 프로젝트를 구축했습니다. 우리는 모두 이 여정을 함께 하고 있습니다. 마음껏：

- 💬 [토론](https://github.com/diandiancha/LittleAIBox/discussions) - 질문하기, 아이디어 공유
- 🐛 [이슈](https://github.com/diandiancha/LittleAIBox/issues) - 버그 보고, 개선 제안
- 📖 [문서](CONTRIBUTING.ko.md) - 기여 방법 학습

**기억하세요：**
> 우리는 모두 함께 학습하고 있습니다. 모든 기여는 크든 작든 우리 모두의 성장에 도움이 됩니다。  
> 질문하는 것을 망설이지 마세요 - 우리는 서로를 돕기 위해 여기에 있습니다！

---

## 🎓 학습 체크리스트

진행 상황 추적：

- [ ] 개발 환경 설정
- [ ] 프로젝트 성공적으로 실행
- [ ] 프로젝트 구조 이해
- [ ] main.js 읽기
- [ ] 첫 코드 변경하기
- [ ] 첫 PR 제출
- [ ] 다른 기여자 도와주기
- [ ] 새로 구축하기

---

**학습을 시작할 준비가 되셨나요？** 🚀

> 저장소를 Fork하고, 로컬에 클론하고, 탐색을 시작하세요. 학습하는 가장 좋은 방법은 실행하는 것입니다！

**질문이 있나요？** [토론](https://github.com/diandiancha/LittleAIBox/discussions) 열기 - 도와드리겠습니다！

---

**즐거운 학습 되세요！** 📚✨


<div align="center">

# LittleAIBox 기여하기

**LittleAIBox 개선에 도움을 주셔서 감사합니다！** 🎉

모든 버그 리포트、아이디어、코드 한 줄이 이 프로젝트를 더 좋게 만듭니다。🌱

[中文](CONTRIBUTING.zh-CN.md) | [English](../CONTRIBUTING.md) | [日本語](CONTRIBUTING.ja.md) | [한국어](CONTRIBUTING.ko.md) | [Español](CONTRIBUTING.es.md)

</div>

---

## 🚀 빠른 시작（신규 기여자용）

1. **Fork 및 클론**

   ```bash
   git clone https://github.com/diandiancha/LittleAIBox.git
   cd LittleAIBox
   npm install
   npm run dev
   ```

2. **변경 사항 만들기** → 로컬로 테스트（터미널에 표시된 포트 확인）

3. **변경 사항 커밋** → `git commit -m "fix: i18n 오타 수정"`

4. **푸시 및 Pull Request 열기**

5. 🎉 완료！가능한 한 빨리 검토하겠습니다。

> 💡 *GitHub가 처음이신가요？[First Contributions](https://github.com/firstcontributions/first-contributions)를 확인하세요。*

---

## 🧭 행동 강령

친절하고, 포용적이며, 건설적으로 행동하세요。

모두가 배우고 있습니다 — 다른 사람의 성장을 도와주세요。❤️

---

## 💡 기여 방법

- 🐛 **버그 리포트** — [Issues](https://github.com/diandiancha/LittleAIBox/issues) 통해
- ✨ **기능 제안** — 새로운 아이디어나 개선사항 환영
- 📝 **문서 개선** — 오타 수정, 예제 추가
- 🌍 **UI 번역** — LittleAIBox를 전 세계에서 접근 가능하게 만들기
- 🔧 **코드 제출** — 버그 수정, 리팩토링, 새 기능
- 🏗️ **코드 리팩토링 협력** — 함께 코드베이스 구조 개선

---

## 🧑‍💻 개발 환경 설정

**요구사항**
- Node.js ≥ 18
- npm ≥ 9
- Git（최신 버전）
- VS Code（권장）

**로컬에서 시작**

```bash
npm install
npm run dev
```

**프로덕션 빌드**

```bash
npm run build
```

**모바일 테스트（선택사항）**

```bash
npx cap add android
npx cap sync
npx cap open android
```

---

## 🧩 프로젝트 구조

```
LittleAIBox/
├── src/                    # 소스 코드
│   ├── main.js            # 메인 애플리케이션 로직
│   ├── api-config.js      # API 설정
│   ├── db.js              # IndexedDB 래퍼
│   ├── i18n.js            # 국제화
│   ├── mermaid-renderer.js # 다이어그램 렌더링
│   ├── floating-timeline.js # 플로팅 타임라인
│   ├── style.css          # 전역 스타일
│   └── sw-custom.js       # Service Worker
├── public/                 # 정적 자산
│   ├── locales/           # 번역 파일（5개 언어）
│   ├── libs/              # 서드파티 라이브러리
│   ├── images/            # 이미지 및 아이콘
│   └── manifest.webmanifest # PWA 매니페스트
├── appshow/                # 언어별 스크린샷
├── capacitor.config.json   # 모바일 앱 설정
├── vite.config.js          # 빌드 설정
├── package.json            # 의존성 및 스크립트
└── index.html              # 메인 HTML 진입점
```

---

## 🧾 커밋 및 코드 스타일（중상급 기여자용）

### 💬 일반적인 커밋

```
<type>(<scope>): <description>
```

**일반적인 유형**
- `feat` — 새 기능
- `fix` — 버그 수정
- `docs` — 문서
- `style` — 코드 포맷팅
- `refactor` — 비파괴적 리팩토링
- `perf` — 성능 개선
- `test` — 테스트 관련

**예제**

```bash
feat(i18n): 포르투갈어 번역 추가
fix(file): PDF 파싱 오류 처리
docs(readme): 설치 지침 업데이트
refactor(rag): 청킹 알고리즘 최적화
```

### 🧱 코드 표준

- **ES6+** 기능 사용
- `async/await` 우선
- `const` 및 `let` 사용（`var` 피하기）
- 필요 시 JSDoc로 명확한 주석 작성
- 함수를 짧고 집중적으로 유지

### 📝 코드 예제

```javascript
// 좋은 예
async function handleFileUpload(file) {
  if (!file) return;
  
  const isValid = validateFile(file);
  if (!isValid) {
    showToast('잘못된 파일 형식');
    return;
  }
  
  try {
    const content = await parseFile(file);
    await processContent(content);
  } catch (error) {
    console.error('파일 처리 중 오류:', error);
    showToast('파일 처리 실패');
  }
}
```

---

## 🔄 Pull Request 프로세스

1. **포크 동기화**
   ```bash
   git fetch upstream
   git merge upstream/main
   ```

2. **브랜치 생성**
   ```bash
   git checkout -b feature/내_기능
   ```

3. **변경 사항 테스트** — 가능하면 여러 브라우저에서 테스트

4. **푸시 및 PR 열기**

**Pull Request 템플릿**

```markdown
## 설명
이 변경이 무엇을 하는지, 그 이유는 무엇인지.

## 유형
- [ ] 버그 수정
- [ ] 새 기능
- [ ] 문서
- [ ] 번역

## 테스트
이러한 변경 사항을 테스트하는 방법:
1. 1단계
2. 2단계

## 체크리스트
- [ ] 코드가 스타일 가이드를 따름
- [ ] 테스트되고 작동 중
- [ ] 새 경고 없음
- [ ] 문서 업데이트됨
```

---

## 🐛 버그 리포트

제출 전:
1. 기존 [Issues](https://github.com/diandiancha/LittleAIBox/issues) 검색
2. 브라우저 콘솔의 오류 확인
3. 다른 브라우저/기기에서 재현 시도

**버그 리포트 템플릿**

```markdown
**버그 설명**
버그의 명확한 설명.

**재현 방법**
재현 단계:
1. '...'로 이동
2. '....' 클릭
3. 오류 확인

**예상 동작**
예상했던 것.

**환경**
- OS: [예: Windows 11]
- Browser: [예: Chrome 120]
- Device: [예: 데스크톱, 모바일]
- Version: [예: 2.3.1]
```

---

## 💡 기능 제안

제안 전 고려사항:
- 프로젝트 비전과 일치하는가（개인정보 우선，로컬 처리）？
- 클라이언트 사이드 전용으로 실행 가능한가？
- 많은 사용자의 이익이 되는가？

**기능 요청 템플릿**

```markdown
**기능 요약**
제안된 기능의 간단한 설명.

**문제 설명**
무엇을 해결하는가？누가 이익을 얻는가？

**제안된 해결책**
이 기능이 어떻게 작동하는가？

**고려된 대안**
다른 어떤 접근 방법을 생각했나요？
```

---

## 🌐 번역

지원 언어:
- 🇨🇳 중국어 간체 (zh-CN)
- 🇹🇼 중국어 번체 (zh-TW)
- 🇬🇧 영어 (en)
- 🇯🇵 일본어 (ja)
- 🇰🇷 한국어 (ko)

**새 언어 추가**

```bash
cp public/locales/en.json public/locales/언어.json
```

값을 편집하고 키를 동일하게 유지한 다음 `src/i18n.js`에 언어 코드 추가:

```javascript
const SUPPORTED_LANGUAGES = ['zh-CN', 'en', 'ja', 'ko', 'zh-TW', '언어'];
```

테스트: `npm run dev` → 설정에서 언어로 전환 → 모든 UI 요소가 번역되었는지 확인.

---

## 🆘 도움이 필요하신가요？

- [README](README.ko.md) 읽기
- [Issues](https://github.com/diandiancha/LittleAIBox/issues) 확인
- [Discussions](https://github.com/diandiancha/LittleAIBox/discussions)에서 질문
- `question` 레이블로 Issue 열기

인내심을 가지세요 — 저는 학생이고 시간이 제한적입니다。🙏

---

## 🎓 학습 자료

오픈 소스 또는 웹 개발이 처음이신가요？

**일반**
- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [오픈 소스 기여 방법](https://opensource.guide/how-to-contribute/)
- [First Contributions](https://github.com/firstcontributions/first-contributions)

**사용 기술**
- [Vanilla JavaScript](https://developer.mozilla.org/ko/docs/Web/JavaScript)
- [Vite](https://vitejs.dev/)
- [Capacitor](https://capacitorjs.com/docs)
- [IndexedDB](https://developer.mozilla.org/ko/docs/Web/API/IndexedDB_API)
- [Service Workers](https://developer.mozilla.org/ko/docs/Web/API/Service_Worker_API)

**코드 품질 및 리팩토링**
- [Refactoring.guru](https://refactoring.guru/) — 리팩토링 패턴 학습
- [Clean Code](https://github.com/ryanmcdermott/clean-code-javascript) — JavaScript 모범 사례
- [모듈 패턴](https://developer.mozilla.org/ko/docs/Web/JavaScript/Guide/Modules) — ES 모듈 가이드

---

## 🙌 감사 인사

모든 기여자는 **Contributors 페이지**에 나열되고 **릴리스 노트**에 소개됩니다。

LittleAIBox를 더 좋게 만들어주셔서 감사합니다！🚀

---

**기억하세요**: 학생 개발자로서 여러분의 기여와 인내심에 진심으로 감사합니다. 함께 놀라운 것을 만들어봅시다！💪

<p align="center">
  <img src="./public/logo/logo-text.png" alt="일본어 문장 분석기" width="340" />
</p>

<p align="center">
  <b>일본어 문장, 한 단어씩 읽기.</b><br />
  형태소, 후리가나, 뜻, 번역을 한 번의 클릭으로.
</p>

<p align="center">
  <a href="https://nihongodemo.howen.ink/">온라인 체험</a> ·
  <a href="https://doc.howen.ink/">문서</a> ·
  <a href="#빠른-시작">로컬 실행</a> ·
  <a href="#ai-에이전트로-배포">AI로 배포하기</a>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb" />
  <a href="https://linux.do/"><img alt="LINUX DO" src="https://img.shields.io/badge/LINUX%20DO-%E6%96%B0%E7%9A%84%E7%90%86%E6%83%B3%E5%9E%8B%E7%A4%BE%E5%8C%BA-f8c12c" /></a>
</p>

<p align="center">
  <a href="README.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.en.md">English</a> · 한국어 · <a href="README.ja.md">日本語</a>
</p>

![분석 결과와 사전 설명](./docs/images/app-home.png)

## 무엇을 할 수 있나요

**문장 읽기**
- 일본어를 입력하거나 붙여넣으면 단어마다 후리가나, 로마자, 품사를 표시하고 문장 전체 번역을 보여 줍니다
- 단어를 클릭하면 그 문장 안에서의 뜻, 용법, 활용과 예문을 볼 수 있습니다
- 여러 단어를 드래그하거나(설명 화면의 「여러 단어 함께 선택」도 가능) 문법 형식이나 관용 표현을 하나로 묶어 설명받을 수 있고, 잘못 나뉜 단어는 한 번에 합칠 수 있습니다

**편의 기능**
- 홈 화면의 「오늘의 문장」은 일본 시간 기준으로 매일 바뀌며, 클릭하면 바로 분석합니다
- 긴 글은 나누어 분석하고, 웹 페이지나 Markdown을 붙여넣으면 서식과 링크를 자동으로 정리합니다
- 이미지 인식: 스크린샷을 올리거나 붙여넣어 일본어 텍스트를 추출합니다
- 원문 읽어 주기(Edge TTS / Gemini TTS)와 현재 문장을 이해하는 AI 일본어 도우미

**인터페이스**
- 중국어 간체·번체, English, 한국어 — 화면, 번역, 설명이 함께 바뀝니다
- 라이트 / 다크 모드, 데스크톱과 모바일 모두 지원
- 최근 분석 기록은 브라우저에 저장됩니다

<table>
  <tr>
    <td width="62%"><img src="./docs/images/app-dark.png" alt="다크 모드" /></td>
    <td width="38%"><img src="./docs/images/mobile-chat.png" alt="모바일 AI 일본어 도우미" /></td>
  </tr>
</table>

## 모델

| 용도 | 기본값 | 선택 |
| --- | --- | --- |
| 분석, 번역, 설명 | DeepSeek `deepseek-flash` | Gemini `gemini-flash-latest` / `gemini-flash-lite-latest` |
| 이미지 인식 | 선택한 텍스트 모델과 동일 | — |
| 읽어 주기 | Edge TTS | Gemini TTS(Gemini 키 필요) |

서버에 설정한 키는 모든 방문자가 함께 사용합니다. 사용자는 설정에서 자신의 키를 입력할 수도 있으며, 키는 해당 브라우저에 저장되고 요청할 때 이 앱의 서버를 거쳐 모델 제공 업체로 전달됩니다.

## 빠른 시작

Node.js 22가 필요합니다.

```bash
git clone https://github.com/cokice/japanese-analyzer.git
cd japanese-analyzer
npm ci
cp .env.example .env.local   # Windows: Copy-Item .env.example .env.local
```

`.env.local`에 키를 하나 이상 입력한 뒤 실행합니다:

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
```

```bash
npm run dev
```

<http://localhost:3000>을 엽니다. 같은 네트워크의 휴대폰에서 접속하려면 `npm run dev -- --hostname 0.0.0.0`으로 실행한 뒤 `http://컴퓨터IP:3000`을 여세요.

## 환경 변수

| 변수 | 설명 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 권장. 기본 분석, 번역, 이미지 인식 |
| `GEMINI_API_KEY` | 선택. Gemini 텍스트 모델, 이미지 인식, Gemini TTS |
| `DEEPSEEK_API_URL` / `GEMINI_API_URL` | 선택. OpenAI 호환 엔드포인트, 비워 두면 공식 주소 사용 |
| `CODE` | 선택. 접속 비밀번호, 비워 두면 비밀번호 없이 사용 |
| `NEXT_PUBLIC_UMAMI_SRC` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | 선택. 둘 다 입력하면 Umami 통계 사용 |

키는 서버에서만 사용되며 브라우저로 전달되지 않습니다. 「오늘의 문장」은 서버 키로 생성하며, 키가 없으면 내장 예문을 보여 줍니다.

<details>
<summary>Umami가 기록하는 내용</summary>

기능 사용 여부, 사용한 제공 업체와 모델, 성공 여부, 소요 시간만 기록합니다. 원문, 번역, 채팅 내용, 이미지, 원본 오류 메시지, API 키는 **포함하지 않습니다**.

- 사용 이벤트: `analyze_sentence`, `image_text_extract`, `tts_speech`, `word_detail_click`
- 분석 결과: `analyze_success`, `analyze_error`, `analyze_cancel`(`duration_ms`, `first_result_ms` 포함, 실패 시 `error_category`만 기록)
- 채팅: `chat_send`, `chat_success`, `chat_error`

</details>

## 배포

### AI 에이전트로 배포

아래 문장을 Claude Code, Codex, Cursor 같은 AI 코딩 도우미에게 보내세요. 배포 위치와 필요한 키를 먼저 물어본 뒤 설치와 확인을 마치고 접속 주소를 알려 줍니다:

```text
https://raw.githubusercontent.com/cokice/japanese-analyzer/master/docs/agent-deploy.md 를 읽고 그 단계에 따라 japanese-analyzer를 배포해 줘.
```

Linux 서버(Docker, 도메인·HTTPS 설정 선택 가능), Vercel, 로컬 실행을 지원합니다. 에이전트가 따르는 절차는 [docs/agent-deploy.md](./docs/agent-deploy.md)에 있습니다.

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cokice/japanese-analyzer)

저장소를 가져온 뒤 `Settings → Environment Variables`에 환경 변수를 입력하고 다시 배포하면 됩니다.

### Docker

`howenhowen/japanese-analyzer` 이미지는 `amd64`와 `arm64`를 지원하며, 컨테이너는 `3002` 포트를 사용합니다.

```bash
cp .env.production.example .env.production   # 키 입력
docker compose -f docker-compose.hub.yml up -d
```

최신 버전으로 업데이트:

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

<details>
<summary>Compose 없이 docker run 사용</summary>

```bash
docker run -d \
  --name japanese-analyzer \
  --restart unless-stopped \
  -p 3002:3002 \
  -e DEEPSEEK_API_KEY="your_deepseek_api_key" \
  -e GEMINI_API_KEY="" \
  -e CODE="" \
  howenhowen/japanese-analyzer:latest
```

업데이트할 때는 새 이미지를 `docker pull`로 받고, `docker rm -f japanese-analyzer`로 기존 컨테이너를 삭제한 뒤 위 명령을 다시 실행합니다.

</details>

## 개발

```bash
npm run dev          # 개발 서버
npm test             # 단위 및 API 테스트
npm run lint         # 코드 검사
npx tsc --noEmit     # 타입 검사
npm run build        # 프로덕션 빌드
```

버그나 제안은 [Issue](https://github.com/cokice/japanese-analyzer/issues)로 알려 주세요. Pull Request도 환영합니다. 분석 문제를 신고할 때는 제공 업체, 모델, 화면 언어, 재현 가능한 예문을 함께 적어 주시고 API 키는 넣지 마세요.

## 감사의 말

[LINUX DO](https://linux.do/) 커뮤니티의 지원에 감사드립니다.

## 라이선스

이 프로젝트는 `mit-final` 이후 라이선스 전환 커밋부터 프로젝트 전체에 [GNU AGPL v3 전용(AGPL-3.0-only)](./LICENSE)을 적용하여 배포합니다.

`mit-final`(`fb57ddc`)을 포함하여 이미 MIT로 공개된 코드에는 기존 MIT 이용 허가가 계속 유효합니다. [기존 MIT 라이선스](./LICENSES/MIT-legacy.txt), [라이선스 및 배포 안내](./LICENSING.md), [저작권 고지](./NOTICE)를 확인하세요.

AGPL은 상업적 이용을 허용합니다. 적용 대상 저작물을 배포하거나 수정한 버전을 네트워크로 제공하는 경우, 라이선스 조건에 따라 해당 소스 코드를 제공해야 합니다.

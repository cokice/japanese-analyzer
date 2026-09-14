# 일본어 문장 분석기

🌐 [简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

중국어 간체·번체, 영어, 한국어 인터페이스를 지원하는 일본어 학습 도구입니다. 일본어 문장을 입력하면 단어, 후리가나, 로마자, 품사, 번역과 자세한 설명을 확인할 수 있습니다. 이미지 속 글자 인식, 음성 읽기, AI 일본어 도우미도 제공합니다.

[온라인 체험](https://nihongodemo.howen.ink/) · [온라인 문서](https://doc.howen.ink/)

<p align="center">
  <img src="./public/logo/logo-text.png" alt="일본어 문장 분석기" width="360" />
</p>

## 화면 미리 보기

아래 이미지는 중국어 간체 화면입니다. 앱의 지구본 아이콘에서 언어를 변경할 수 있습니다.

![문장 분석, 번역과 단어 설명](./docs/images/app-home.png)
![다크 모드](./docs/images/app-dark.png)
![모델 및 API 설정](./docs/images/provider-settings.png)

<p align="center">
  <img src="./docs/images/mobile-chat.png" alt="모바일 AI 일본어 도우미" width="390" />
</p>

## 주요 기능

- **언어 선택:** 오른쪽 위 지구본 아이콘에서 简体中文, 繁體中文, English, 한국어를 선택합니다. 화면 문구, 번역, 단어 설명과 새 AI 답변에 선택한 언어가 적용되며, 브라우저에 저장됩니다. 중국어 번체는 글자만 변환하지 않고 자연스러운 어휘와 표현을 사용합니다.
- **일본어 분석:** 일본 학교 문법에 따라 단어를 나누고 품사와 후리가나를 표시합니다. 로마자는 앱에서 생성하며, 인터페이스 언어와 관계없이 일본어 원문과 읽기는 그대로 유지됩니다.
- **문맥에 맞는 단어 설명:** 단어를 누르면 뜻, 사전형, 활용, 문장 속 역할과 번역이 포함된 예문을 볼 수 있습니다.
- **문장 번역:** 문단과 줄바꿈을 유지합니다. 언어를 바꾸면 다시 번역하며, 기존 채팅 메시지는 원래 언어로 남습니다.
- **일반 텍스트 붙여넣기:** 웹페이지 스타일, Markdown 서식과 링크 주소를 제거하고 링크에 표시된 글자와 문단 구분을 남깁니다. 단독 웹 주소도 제거합니다. 이미지를 붙여넣으면 기존처럼 OCR을 실행합니다.
- **긴 글과 링크 처리:** 긴 글을 나누어 분석합니다. 입력에 남아 있는 URL은 앱에서 보존하므로 모델이 긴 인코딩 문자열을 다시 생성할 필요가 없습니다. 불완전한 결과는 계속 검증합니다.
- **이미지 OCR:** 이미지를 업로드하거나 붙여넣어 선택한 제공 업체로 일본어를 추출합니다.
- **음성 읽기:** Edge TTS와 Gemini TTS를 지원하며, 음성 설정 메뉴는 버튼 아래로 열립니다.
- **AI 일본어 도우미:** 문법, 어휘, 문화, 공부 방법과 현재 문장에 관해 질문할 수 있습니다.
- **모델 설정:** DeepSeek와 Gemini를 전환하고 스트리밍 출력을 설정할 수 있습니다. 제공 업체별 API 키를 브라우저에 따로 저장할 수도 있습니다.
- 라이트·다크·시스템 테마, 선택적 접속 비밀번호와 Umami 통계, Vercel 및 Docker 배포를 지원합니다.

## 모델

아래는 이 저장소에서 사용하는 모델 식별자입니다.

| 용도 | 모델 / 서비스 | 동작 |
| --- | --- | --- |
| 기본 텍스트 처리 | DeepSeek `deepseek-flash` | 사고 모드는 꺼져 있으며 현재 설정에서 전환할 수 없습니다. |
| Gemini 텍스트 처리 | `gemini-flash-latest` / `gemini-flash-lite-latest` | Flash와 Flash-Lite를 선택할 수 있습니다. 추론 수준은 각각 Low와 Minimal입니다. |
| 이미지 OCR | `deepseek-flash` / 선택한 Gemini 모델 | DeepSeek는 텍스트와 같은 모델을 사용하며 OCR에서는 사고 모드를 끕니다. |
| 음성 읽기 | Edge TTS / `gemini-3.1-flash-tts-preview` | 기본값은 Edge TTS입니다. Gemini TTS에는 Gemini API 키가 필요합니다. |

## 빠른 시작

Docker 이미지와 같은 Node.js 22를 사용하세요.

```bash
git clone https://github.com/cokice/japanese-analyzer.git
cd japanese-analyzer
npm ci
cp .env.example .env.local
```

Windows PowerShell에서는 마지막 명령 대신 `Copy-Item .env.example .env.local`을 사용합니다.

기본 제공 업체를 사용하려면 `.env.local`에 `DEEPSEEK_API_KEY`를 입력하세요. Gemini 텍스트 처리, OCR 또는 음성을 사용하려면 `GEMINI_API_KEY`도 설정합니다. API 주소를 비워 두면 기본 엔드포인트를 사용합니다.

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_API_URL=
GEMINI_API_KEY=
GEMINI_API_URL=
CODE=
NEXT_PUBLIC_UMAMI_SRC=
NEXT_PUBLIC_UMAMI_WEBSITE_ID=
```

```bash
npm run dev
```

[http://127.0.0.1:3000](http://127.0.0.1:3000)을 엽니다. 같은 로컬 네트워크의 다른 기기에서 테스트하려면 다음과 같이 실행하세요.

```bash
npm run dev -- --hostname 0.0.0.0 --port 3100
```

다른 기기에서 `http://<컴퓨터의-LAN-IP>:3100`에 접속합니다.

## 환경 변수

| 변수 | 용도 |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek 텍스트 처리와 OCR에 사용할 서버 기본 API 키입니다. |
| `DEEPSEEK_API_URL` | 선택적 OpenAI 호환 API 주소입니다. 기본값은 `https://api.deepseek.com/chat/completions`입니다. |
| `GEMINI_API_KEY` | Gemini 텍스트 처리, OCR과 TTS에 사용할 서버 기본 API 키입니다. |
| `GEMINI_API_URL` | 선택적 OpenAI 호환 API 주소입니다. 기본값은 `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`입니다. |
| `CODE` | 선택적 접속 비밀번호입니다. 비워 두면 비밀번호를 묻지 않습니다. |
| `NEXT_PUBLIC_UMAMI_SRC` | 선택적 Umami 스크립트 주소입니다. 예: `https://cloud.umami.is/script.js`. |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Umami 웹사이트 ID입니다. 스크립트 주소와 함께 설정해야 통계가 활성화됩니다. |

서버 API 키는 프런트엔드에 공개하지 않습니다. 사용자는 오른쪽 위 설정에서 자신의 키를 입력할 수도 있습니다. 이 키는 해당 브라우저에 저장되며 API 요청 시 이 앱의 서버로 전송됩니다. API 엔드포인트는 서버에서 설정합니다. Gemini TTS는 별도의 공식 음성 API를 사용하므로 `GEMINI_API_URL`의 영향을 받지 않습니다.

Umami는 실행 시 환경 변수를 읽습니다. 기능 사용, 제공 업체, 모델, 스트리밍 여부, 요청 시간, 첫 결과 표시 시간과 정해진 오류·취소 분류를 기록합니다. 이벤트에 원문, 채팅 메시지나 답변, 이미지, 번역, 원시 오류 메시지 또는 API 키를 포함하지 않습니다. 로컬 환경 변수 파일은 Git에서 제외되며 커밋하지 않아야 합니다.

## Vercel 배포

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/cokice/japanese-analyzer)

1. 저장소를 포크하거나 Vercel로 가져옵니다.
2. **Settings → Environment Variables**에서 기본 제공 업체용 `DEEPSEEK_API_KEY`를 설정합니다.
3. 필요에 따라 `GEMINI_API_KEY`, `CODE`와 두 Umami 변수를 추가합니다.
4. 배포합니다. 환경 변수를 변경했다면 다시 배포하세요.

## Docker 배포

Docker Hub 이미지 `howenhowen/japanese-analyzer:latest`는 `linux/amd64`와 `linux/arm64`를 지원합니다. 저장소 루트에서 실행하세요.

```bash
cp .env.production.example .env.production
# .env.production을 열어 필요한 API 키를 설정합니다.
docker compose -f docker-compose.hub.yml up -d
```

Windows PowerShell에서는 `Copy-Item .env.production.example .env.production`으로 템플릿을 복사합니다. 호스트와 컨테이너 포트는 모두 `3002`입니다. 실행 후 `http://<서버-IP>:3002`에 접속하세요.

이미지를 업데이트하고 컨테이너를 다시 만들거나 로그를 확인하려면 다음 명령을 사용합니다.

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
docker compose -f docker-compose.hub.yml logs -f
```

같은 환경 변수 파일로 컨테이너를 직접 실행할 수도 있습니다.

```bash
docker run -d --name japanese-analyzer --restart unless-stopped \
  --env-file .env.production -p 3002:3002 \
  howenhowen/japanese-analyzer:latest
```

## 개발 명령

```bash
npm run dev          # 개발 서버
npm test             # API, 다국어, 분석 및 붙여넣기 회귀 테스트
npm run lint         # 저장소 린트 검사
npm run build        # 프로덕션 빌드 및 타입 검사
npm start            # 빌드된 프로덕션 앱 실행
npx tsc --noEmit     # 타입 검사만 실행
```

## 문제 해결 및 기여

- 복사한 글을 분석하다 오류가 나면 다시 붙여넣어 서식과 링크 주소를 제거하세요. 계속 실패하면 제공 업체, 모델, 화면 언어와 재현 가능한 예문을 Issue에 첨부해 주세요. API 키는 포함하지 마세요.
- 언어 설정은 브라우저마다 따로 저장됩니다. 지구본 아이콘으로 변경할 수 있으며 브라우저 번역 기능은 필요하지 않습니다.
- 버그 신고, 기능 제안과 Pull Request를 환영합니다.

## 감사 및 라이선스

[LINUX DO](https://linux.do/) 커뮤니티의 지원에 감사드립니다. 이 프로젝트는 `mit-final` 이후 라이선스 전환 커밋부터 프로젝트 전체에 [GNU AGPL v3 전용(AGPL-3.0-only)](./LICENSE)을 적용하여 배포합니다.

`mit-final`(`fb57ddc`)을 포함하여 이미 MIT로 공개된 코드에는 기존 MIT 이용 허가가 계속 유효합니다. [기존 MIT 라이선스](./LICENSES/MIT-legacy.txt), [라이선스 및 배포 안내](./LICENSING.md), [저작권 고지](./NOTICE)를 확인하세요.

AGPL은 상업적 이용을 허용합니다. 적용 대상 저작물을 배포하거나 수정한 버전을 네트워크로 제공하는 경우, 라이선스 조건에 따라 해당 소스 코드를 제공해야 합니다.

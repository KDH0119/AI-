# 🎨 NovelAI Batch Generator

NovelAI V4.5를 사용한 대량 이미지 생성 도구

## ✨ 주요 기능

### 1️⃣ 연속 뽑기 기능
- 동일한 설정으로 1~50장 연속 생성
- 작가 태그, 네거티브 태그, 캐릭터 태그 고정
- 시드만 랜덤으로 변경하여 다양한 결과 생성

### 2️⃣ 메모장 기반 생성 기능
- 최대 50개의 메모장 생성 가능
- 작가/네거티브/캐릭터 외모 태그는 고정
- 각 메모장마다 다른 **상황/행동/배경** 태그 설정
- 메모장 개수만큼 다양한 이미지 생성

## 📋 요구사항

- Node.js (v14 이상)
- NovelAI API 키 (유료 구독 필요)
- 브라우저 (Chrome, Firefox 등)

## 🚀 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 프록시 서버 실행
```bash
npm start
```

서버가 `http://localhost:3000`에서 실행됩니다.

### 3. 웹 페이지 열기
`batch-generator.html` 파일을 브라우저로 엽니다.

## 📖 사용 방법

### 초기 설정

1. **API 키 설정**
   - NovelAI API 키 입력 후 "Save Key" 클릭

2. **저장 폴더 설정** (선택사항)
   - 다운로드할 폴더 경로 입력

3. **작가 태그 설정**
   ```
   0.8::artist:gogalking::, 0.9::artist:try (lsc)::, 1.2::artist:ratatatat74::
   ```

4. **네거티브 태그 설정**
   ```
   nsfw, lowres, bad quality, blurry, watermark, worst quality
   ```

5. **캐릭터 태그 설정** (외모/외형만!)
   - 캐릭터 1: `1girl, long hair, blue eyes, school uniform`
   - + 버튼으로 캐릭터 2, 3 추가 가능

6. **이미지 크기 선택**
   - Portrait (832×1216)
   - Landscape (1216×832)
   - Square (1024×1024)

### 연속 뽑기 사용법

1. "연속 뽑기" 모드 선택
2. 슬라이더로 생성 개수 설정 (1~50장)
3. "🚀 연속 생성 시작" 클릭
4. 생성 완료 후 "💾 전체 다운로드" 클릭

### 메모장 기반 생성 사용법

1. "메모장 생성" 모드 선택

2. **메모장 추가**
   - 가운데 패널의 + 버튼 클릭
   - 메모장 제목 입력

3. **상황/행동 태그 입력**
   - 캐릭터 1 상황: `standing, holding sign, smiling, indoor, white background`
   - + 버튼으로 캐릭터 2, 3 상황 추가 가능

4. **여러 메모장 생성** (최대 50개)
   - 메모장 2: `sitting, reading book, classroom`
   - 메모장 3: `running, outdoor, park, sunny day`
   - ...

5. **생성 시작**
   - "🎨 메모장 기반 생성" 클릭
   - 메모장 개수만큼 이미지 생성됨

6. **다운로드**
   - "💾 전체 다운로드" 클릭

## 🎯 사용 예시

### 예시 1: 같은 캐릭터의 다양한 포즈 (연속 뽑기)
```
작가 태그: 1.2::artist:ratatatat74::, 0.8::artist:gogalking::
캐릭터 1: 1girl, long hair, blue eyes, school uniform
생성 개수: 20장
→ 같은 캐릭터의 다양한 랜덤 포즈 20장 생성
```

### 예시 2: 다양한 상황의 이미지 (메모장 기반)
```
작가 태그: 1.2::artist:ratatatat74::, 0.8::artist:gogalking::
캐릭터 1: 1girl, long hair, blue eyes, school uniform

메모장 1: standing, waving hand, smiling, school hallway
메모장 2: sitting on desk, reading book, classroom
메모장 3: running, outdoor, cherry blossoms
메모장 4: eating lunch, cafeteria, friends
메모장 5: playing piano, music room
→ 5가지 다른 상황의 이미지 생성
```

### 예시 3: 여러 캐릭터 상호작용 (메모장 기반)
```
작가 태그: 1.2::artist:ratatatat74::
캐릭터 1: 1girl, long hair, blue eyes, school uniform
캐릭터 2: 1girl, short hair, red eyes, school uniform

메모장 1:
  - 캐릭터 1 상황: standing, holding book, smiling
  - 캐릭터 2 상황: sitting, listening, looking at viewer

메모장 2:
  - 캐릭터 1 상황: running, chasing
  - 캐릭터 2 상황: running, laughing

→ 두 캐릭터가 상호작용하는 이미지 생성
```

## ⚙️ 설정 팁

### 작가 태그
- 가중치 범위: 0.1 ~ 3.0
- 형식: `가중치::artist:작가명::`
- 여러 작가 혼합 가능

### 캐릭터 태그 구분
- **외모/외형 태그** (고정): `1girl, long hair, blue eyes, school uniform`
- **상황/행동 태그** (메모장에 작성): `standing, smiling, indoor`

### 네거티브 태그
- 기본 품질: `lowres, bad quality, blurry, worst quality`
- NSFW 차단: `nsfw, nude, explicit`
- 아티팩트 제거: `bad hands, bad anatomy, extra fingers`

## 📂 파일 구조

```
batch-generator/
├── batch-generator.html    # 메인 페이지
├── batch-generator.css     # 스타일
├── batch-generator.js      # 로직
├── proxy-server.js         # 프록시 서버
├── package.json            # 의존성
└── README.md               # 이 파일
```

## 🐛 문제 해결

### "API 키를 먼저 설정해주세요"
→ 오른쪽 설정 패널에서 API 키 입력 후 "Save Key" 클릭

### "프록시 서버 연결 오류"
→ 터미널에서 `npm start`로 서버 실행 확인

### "이미지 생성 중 오류"
→ API 키가 유효한지, 구독이 활성화되어 있는지 확인

### 메모장이 저장 안 됨
→ 텍스트 입력 후 다른 곳 클릭 (blur 이벤트로 자동 저장)

## 💡 팁

1. **첫 테스트는 연속 뽑기 1~3장으로**: 설정이 제대로 되었는지 확인
2. **메모장은 구체적으로**: "서 있는" 보다 "책상에 기대어 서 있는"이 더 정확
3. **가중치는 0.5~1.5 범위 추천**: 너무 높으면 스타일이 과하게 적용됨
4. **캐릭터 수는 적을수록 안정적**: 1~2개 권장

## 📊 성능

- **생성 속도**: 이미지 1장당 약 5~10초 (Steps 28 기준)
- **대량 생성**: 50장 약 5~10분
- **메모리**: 브라우저 캐시에 이미지 저장 (메모리 주의)

## ⚠️ 주의사항

1. **API 비용**: NovelAI는 유료 서비스입니다
2. **저작권**: 생성된 이미지는 NovelAI 이용약관을 따릅니다
3. **메모리**: 많은 이미지 생성 시 브라우저가 느려질 수 있습니다

## 📄 라이센스

MIT License

---

**만든이**: 김동환  
**버전**: 1.0.0  
**마지막 업데이트**: 2025년

**대량 이미지 생성 화이팅!** 🎨🚀

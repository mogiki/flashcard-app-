# FlashCard App

퀴즐렛 MHT/CSV 불러오기 + 네이티브 TTS 플래시카드 앱

## APK 빌드 방법 (폰만으로 가능)

### 1단계: GitHub에 코드 올리기

1. **github.com** 접속 → 로그인
2. 우측 상단 **+** → **New repository**
3. Repository name: `flashcard-app`
4. **Public** 선택 → **Create repository**
5. 생성된 페이지에서 **uploading an existing file** 클릭
6. 이 zip 파일 안의 **모든 파일/폴더**를 업로드
7. **Commit changes** 클릭

### 2단계: Expo Token 발급

1. **expo.dev** 접속 → 로그인
2. 우측 상단 프로필 → **Access tokens**
3. **Create token** → 이름: `github-actions` → **Create**
4. 토큰 복사 (한 번만 보여요!)

### 3단계: GitHub Secret 등록

1. GitHub 레포지토리 → **Settings** 탭
2. 왼쪽 **Secrets and variables** → **Actions**
3. **New repository secret**
   - Name: `EXPO_TOKEN`
   - Secret: 위에서 복사한 토큰 붙여넣기
4. **Add secret**

### 4단계: 빌드 실행

1. GitHub 레포지토리 → **Actions** 탭
2. 왼쪽 **EAS Build APK** 클릭
3. **Run workflow** → **Run workflow** 버튼 클릭
4. 빌드 시작 (약 10~15분 소요)

### 5단계: APK 다운로드

1. 빌드 완료 후 → Actions에서 해당 빌드 클릭
2. 하단 **Artifacts** → **flashcard-apk** 다운로드
3. zip 안에 `flashcard.apk` 있음
4. 폰으로 옮겨서 설치 (설정 → 알 수 없는 앱 허용 필요)

---

## 기능

- MHT / HTML / CSV 파일 불러오기 (퀴즐렛 지원)
- 카드 플립 학습 (앞→뒤→앞 토글)
- 연속 학습 모드 (자동 넘김)
- 네이티브 TTS (끊김 없음)
- 이해/애매/모름 판정
- 별표 기능
- 망각곡선 복습 알림
- 학습 통계 & 스트릭
- 카드 수정
- 진행 상태 저장 (이어하기)
- 여러 덱 관리

# 진행도 정리

🎯 현재 완전 구현된 기능
📊 실시간 데이터 & 차트

실시간 비트코인/이더리움/리플 시세 (업비트 WebSocket)
실시간 호가창 (일반호가/누적호가)
캔들차트 (5분/15분/1시간/4시간/1일) + 이동평균선(MA5, MA20)
거래량 차트
코인별 탭 전환 및 시간대별 차트 전환

💰 거래 시스템

시장가 주문 (매수/매도 즉시 체결)
지정가 주문 (실시간 호가창 매칭 체결 시스템)
실시간 주문 매칭 엔진 (가격 조건 만족시 자동 체결)
부분 체결 지원
주문 취소 기능
잔고 예약 시스템 (주문시 즉시 잔고 차감)

📈 주문 관리

대기 주문 목록 (pending orders)
체결 내역 조회 (transaction history)
실시간 체결 알림 (WebSocket 토스트)
주문 상태 추적 (pending → partial → filled → cancelled)

💳 잔고 관리

실시간 KRW/BTC/ETH/XRP 잔고 표시
주문가능 금액 계산
잔고 기반 주문 수량 계산 (10%/25%/50%/100% 버튼)
체결시 자동 잔고 업데이트

🎮 UI/UX 기능

호가창 클릭으로 주문가 자동 입력
현재가 대비 % 주문가 설정
가격 단위별 증감 버튼 (+/-)
다크 테마 디자인
반응형 레이아웃

⚠️ 부분 구현/미구현 기능
🔐 인증 시스템

로그인/회원가입 (UI만 있음)
사용자별 세션 관리
다중 사용자 지원

📚 과거 시나리오 학습

시나리오 선택 페이지
시나리오 1 상세 페이지 (2021년 불장)
시나리오 2-5 상세 페이지
실제 과거 데이터 기반 시뮬레이션
시나리오별 성과 분석

📊 고급 거래 기능

예약 주문 (특정 시간/조건부)
손절매/수익실현 자동 주문
분할 매수/매도 전략
포트폴리오 분석 도구

📈 차트 고급 기능

더 많은 기술지표 (RSI, MACD, 볼린저밴드 등)
트렌드라인 그리기
차트 패턴 분석
알림/워치리스트 기능

# 🚀 Docker로 MSSQL 서버 세팅 가이드

이 프로젝트는 MSSQL 데이터베이스를 사용합니다. 로컬 환경에서는 Docker를 이용해 간편하게 서버를 띄우는 것을 권장합니다.

## 1️⃣ Docker로 MSSQL 서버 실행

### 🐳 SQL Server 컨테이너 생성 및 실행

아래 명령어를 통해 최신 SQL Server 2022 이미지를 다운로드하고 컨테이너를 생성, 실행할 수 있습니다.

> ⚠️ **주의**: 비밀번호는 최소 8자리, 특수문자 포함

```bash
# 최신 SQL Server 2022 이미지 다운로드
docker pull mcr.microsoft.com/mssql/server:2022-latest

# 컨테이너 최초 생성 및 실행
docker run -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=YourStrongPassword1!" \
   -p 1433:1433 --name sqlserver \
   -d mcr.microsoft.com/mssql/server:2022-latest
```

### 📋 연결 정보

- **컨테이너 이름**: `sqlserver`
- **포트**: `1433` (기본 SQL Server 포트)
- **계정**: `sa`
- **비밀번호**: `YourStrongPassword1!`

### 💡 컨테이너 관리 명령어

> 📌 **참고**: 컨테이너는 한 번만 생성하면 됩니다. 다음부터는 아래 명령어로 실행/중지하세요.

```bash
# 컨테이너 실행
docker start sqlserver

# 컨테이너 중지
docker stop sqlserver
```

## 2️⃣ SSMS 연결 정보

SSMS(SQL Server Management Studio) 또는 다른 클라이언트로 데이터베이스에 연결할 때 사용되는 정보입니다.

| 항목         | 값                     |
| ------------ | ---------------------- |
| **서버**     | `localhost,1433`       |
| **로그인**   | `sa`                   |
| **비밀번호** | `YourStrongPassword1!` |

## 3️⃣ 데이터베이스 및 사용자 생성

> ⚠️ 아래 SQL은 예시입니다. 필요 시 수정해서 사용하세요.

```sql
-- 데이터베이스 생성
CREATE DATABASE new_trading_db;
GO

-- 프로젝트용 사용자 계정 생성
CREATE LOGIN new_trading_user WITH PASSWORD = 'YourStrongPassword1!';
GO

USE new_trading_db;
CREATE USER new_trading_user FOR LOGIN new_trading_user;
ALTER ROLE db_owner ADD MEMBER new_trading_user;
GO
```

## 4️⃣ 테이블 생성

```sql
USE new_trading_db;
GO

-- users 테이블
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50) NOT NULL UNIQUE,
    password NVARCHAR(10) NOT NULL UNIQUE,
    krw_balance DECIMAL(18,0) NOT NULL DEFAULT 0,
    btc_balance DECIMAL(18,8) NOT NULL DEFAULT 0,
    eth_balance DECIMAL(18,8) NOT NULL DEFAULT 0,
    xrp_balance DECIMAL(18,8) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME NOT NULL DEFAULT GETDATE()
);
GO

-- transactions 테이블
CREATE TABLE transactions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    market NVARCHAR(20) NOT NULL,
    side NVARCHAR(10) NOT NULL,
    price DECIMAL(18,0) NOT NULL,
    quantity DECIMAL(18,8) NOT NULL,
    total_amount DECIMAL(18,0) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE(),
    type NVARCHAR(10) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
GO

-- pending_orders 테이블
CREATE TABLE pending_orders (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    market NVARCHAR(20) NOT NULL,
    side NVARCHAR(10) NOT NULL, -- 'bid' or 'ask'
    order_type NVARCHAR(10) NOT NULL, -- 'limit' or 'market'
    price DECIMAL(18,0) NULL, -- 지정가 (원화는 정수)
    quantity DECIMAL(18,8) NOT NULL,
    remaining_quantity DECIMAL(18,8) NOT NULL, -- 미체결 수량
    total_amount DECIMAL(18,0) NOT NULL,
    status NVARCHAR(20) DEFAULT 'pending', -- 'pending', 'partial', 'filled', 'cancelled'
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),

    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## 5️⃣ 초기 사용자 등록

```sql
-- 초기 사용자 등록
INSERT INTO users (username, password, krw_balance, btc_balance, eth_balance, xrp_balance)
VALUES ('testuser', 'pw', 1000000, 0, 0, 0);
GO
```

## ✅ 완료

이제 DB 준비가 완료되었습니다. 서버 코드의 `CONFIG.DB_CONFIG` 설정과 동일하게 연결 정보를 맞추면 정상 동작합니다.

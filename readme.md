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

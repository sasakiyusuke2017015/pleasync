# pleasync-client ビルド用 Dockerfile
# napi-rs で Node.js ネイティブモジュール (.node) を生成

# ===== ビルドステージ =====
FROM debian:bookworm-slim AS builder

# 必要なツールをインストール
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Node.js をインストール
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Rust (最新 stable) をインストール
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app

# 依存関係のキャッシュ用に先に Cargo ファイルをコピー
COPY Cargo.toml ./
COPY build.rs ./

# Cargo.lock を再生成（バージョン互換性のため）
RUN mkdir src && echo "fn main() {}" > src/lib.rs
RUN cargo generate-lockfile
RUN cargo build --release || true
RUN rm -rf src

# 実際のソースをコピー
COPY src ./src
COPY package.json package-lock.json ./

# npm 依存関係をインストール
RUN npm install

# napi-rs でビルド
RUN npm run build

# ===== 出力ステージ =====
FROM node:20-slim AS output

WORKDIR /app

# ビルド成果物をコピー
COPY --from=builder /app/*.node ./
COPY --from=builder /app/index.js ./
COPY --from=builder /app/index.d.ts ./
COPY --from=builder /app/package.json ./

# 確認用
RUN ls -la

CMD ["node", "-e", "const { PleasanterClient } = require('./'); console.log('pleasync-client loaded successfully')"]

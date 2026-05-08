-- ═══════════════════════════════════════════════════════════════
--   RISE SST — Schema do Banco de Dados (Neon PostgreSQL)
--   Execute no Neon SQL Editor para recriar as tabelas
-- ═══════════════════════════════════════════════════════════════

-- Tabela principal de dados (key-value store)
CREATE TABLE IF NOT EXISTS rise_store (
  id         SERIAL PRIMARY KEY,
  user_key   VARCHAR(100) NOT NULL DEFAULT 'rise_user',
  store_key  VARCHAR(100) NOT NULL,
  data       JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_key, store_key)
);

-- Tabela de usuários multi-tenant
CREATE TABLE IF NOT EXISTS rise_users (
  id               SERIAL PRIMARY KEY,
  username         VARCHAR(100) UNIQUE NOT NULL,
  password         VARCHAR(200) NOT NULL,
  nome             VARCHAR(200) NOT NULL,
  email            VARCHAR(200),
  empresa          VARCHAR(200),
  logo_url         TEXT,
  is_master        BOOLEAN DEFAULT FALSE,
  ativo            BOOLEAN DEFAULT TRUE,
  plano            VARCHAR(50) DEFAULT 'starter',
  acesso_buscador  BOOLEAN DEFAULT TRUE,
  acesso_whatsapp  BOOLEAN DEFAULT TRUE,
  acesso_crm       BOOLEAN DEFAULT TRUE,
  acesso_ia        BOOLEAN DEFAULT TRUE,
  limite_busca     INTEGER DEFAULT 25,
  limite_disparo   INTEGER DEFAULT 200,
  busca_usada      INTEGER DEFAULT 0,
  disparo_usado    INTEGER DEFAULT 0,
  busca_reset_at   TIMESTAMPTZ DEFAULT NOW(),
  disparo_reset_at TIMESTAMPTZ DEFAULT NOW(),
  criado_em        TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ DEFAULT NOW(),
  criado_por       VARCHAR(100),
  obs              TEXT
);

-- Tabela de atividades (histórico completo)
CREATE TABLE IF NOT EXISTS rise_user_activity (
  id         SERIAL PRIMARY KEY,
  username   VARCHAR(100) NOT NULL,
  tipo       VARCHAR(50) NOT NULL,
  descricao  TEXT,
  dados      TEXT,
  criado_em  TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir usuário master padrão
INSERT INTO rise_users (username, password, nome, email, is_master, plano, limite_busca, limite_disparo)
VALUES ('gustavo1996c', '1996', 'Gustavo', 'gustavo.carvalho@swgconsulting.com.br', TRUE, 'master', 999999, 999999)
ON CONFLICT (username) DO UPDATE SET is_master=TRUE, limite_busca=999999, limite_disparo=999999;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_rise_store_user    ON rise_store(user_key);
CREATE INDEX IF NOT EXISTS idx_rise_store_keys    ON rise_store(user_key, store_key);
CREATE INDEX IF NOT EXISTS idx_rise_activity_user ON rise_user_activity(username);
CREATE INDEX IF NOT EXISTS idx_rise_activity_tipo ON rise_user_activity(tipo);
CREATE INDEX IF NOT EXISTS idx_rise_activity_ts   ON rise_user_activity(criado_em DESC);

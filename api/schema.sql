-- =================================================================
-- Invictus.Med — esquema do banco (Cloudflare D1 / SQLite)
--   npx wrangler d1 execute invictus --remote --file=schema.sql
-- =================================================================

-- Contas. O e-mail é a identidade: não há senha para guardar nem vazar.
CREATE TABLE IF NOT EXISTS usuarios (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  criado_em     INTEGER NOT NULL,
  ultimo_acesso INTEGER
);

-- Links mágicos. Guardamos apenas o HASH do token: se o banco vazar,
-- ninguém consegue entrar com o que está gravado aqui.
CREATE TABLE IF NOT EXISTS links_magicos (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expira_em  INTEGER NOT NULL,
  usado_em   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_links_expira ON links_magicos(expira_em);

-- Sessões ativas. Também por hash, e revogáveis uma a uma.
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criada_em  INTEGER NOT NULL,
  expira_em  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_expira  ON sessoes(expira_em);

-- Assinaturas. Preenchida na fase de cobrança; por enquanto todo mundo
-- é "gratis" e o resto do sistema já sabe lidar com isso.
CREATE TABLE IF NOT EXISTS assinaturas (
  usuario_id    TEXT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'gratis',   -- gratis | ativa | atrasada | cancelada
  provedor      TEXT,                             -- mercadopago
  provedor_id   TEXT,                             -- id da preapproval
  periodo_fim   INTEGER,                          -- até quando o acesso pago vale
  atualizada_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assin_provedor ON assinaturas(provedor_id);

-- Uso diário, para aplicar o limite do plano gratuito e para você enxergar
-- consumo real ANTES de definir preço.
CREATE TABLE IF NOT EXISTS uso (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  dia        TEXT NOT NULL,        -- AAAA-MM-DD (UTC)
  modo       TEXT NOT NULL,        -- ficha | caso | quiz | ...
  contagem   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario_id, dia, modo)
);

-- Histórico e favoritos deixam de morrer quando a pessoa troca de aparelho.
CREATE TABLE IF NOT EXISTS itens (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL,        -- historico | favorito
  nome       TEXT NOT NULL,
  ts         INTEGER NOT NULL,
  PRIMARY KEY (usuario_id, tipo, nome)
);
CREATE INDEX IF NOT EXISTS idx_itens_ts ON itens(usuario_id, tipo, ts DESC);

-- Chạy 1 lần để tăng tốc Full-Text Search (Phase 12) - không bắt buộc
-- cho demo/portfolio quy mô nhỏ, nhưng NÊN CÓ nếu bảng events lớn dần.
-- Cách chạy: mở Neon Console -> SQL Editor -> dán và Run, HOẶC:
--   npx prisma db execute --file prisma/add_search_index.sql --schema prisma/schema.prisma

CREATE INDEX IF NOT EXISTS events_fulltext_search_idx
ON events
USING GIN (to_tsvector('simple', title || ' ' || coalesce(description, '')));

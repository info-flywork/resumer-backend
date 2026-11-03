-- AI portreleri Bunny CDN'e taşınır: yeni portre yalnızca CDN'de (storage_key), image boş.
-- Eski portreler scripts/portraits_to_cdn.js ile taşınır; eski /ai/portraits/:id.png adresi CDN'e yönlendirir.
-- Sütun ekleme + NULL yapma çevrimiçi (tablo kilitlenmez, okuma / yazma sürer).
ALTER TABLE ai_portraits
  ADD COLUMN storage_key VARCHAR(255) NULL,
  MODIFY image MEDIUMBLOB NULL,
  ALGORITHM=INPLACE, LOCK=NONE;

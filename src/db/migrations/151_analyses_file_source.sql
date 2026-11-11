-- Dosya yükleme kaynağı (PDF / DOCX analizi)
ALTER TABLE analyses
  MODIFY COLUMN source ENUM('cv','linkedin','file') NOT NULL;

-- Kredi sistemi kaldırıldı: Resumer Pro → sınırsız AI; ücretsiz kullanıcı → tüm AI özellikleri için toplam 1 deneme.
-- Satır varsa deneme kullanılmıştır (user_id birincil anahtar → çift kullanım olmaz). Başarısız işlemde satır silinir.
CREATE TABLE ai_trial_uses (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  reason VARCHAR(32) NOT NULL, -- analysis | tailor | translation | portrait
  ref_id VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ai_trial_uses_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daha önce (iade edilmemiş) en az bir AI işlemi yapmış kullanıcının denemesi kullanılmış sayılır
INSERT INTO ai_trial_uses (user_id, reason, ref_id)
SELECT user_id, 'migrated', NULL FROM credit_ledger
GROUP BY user_id
HAVING SUM(CASE WHEN reason IN ('analysis', 'tailor', 'translation', 'portrait') THEN 1 WHEN reason = 'refund' THEN -1 ELSE 0 END) > 0;

DROP TABLE credit_ledger;
DROP TABLE user_wallets;

-- SSS "Nasıl çalışır?" metni: kredi yerine ücretsiz deneme + Pro
UPDATE faqs SET answer = CASE locale
  WHEN 'en' THEN 'Create a CV with the guided builder or pick an existing one, then use the AI tools. You can try any AI tool once for free; Resumer Pro gives you unlimited access to all of them.'
  WHEN 'tr' THEN 'Rehberli oluşturucuyla bir CV oluşturun veya mevcut birini seçin, ardından yapay zekâ araçlarını kullanın. Yapay zekâ araçlarından birini bir kez ücretsiz deneyebilirsiniz; Resumer Pro ile hepsini sınırsız kullanırsınız.'
  WHEN 'de' THEN 'Erstellen Sie einen CV mit dem geführten Builder oder wählen Sie einen vorhandenen, dann nutzen Sie die KI-Tools. Sie können ein KI-Tool einmal kostenlos testen; mit Resumer Pro nutzen Sie alle unbegrenzt.'
  WHEN 'it' THEN 'Crea un CV con il builder guidato o scegline uno esistente, poi usa gli strumenti IA. Puoi provare gratis uno strumento IA una volta; con Resumer Pro li usi tutti senza limiti.'
  WHEN 'fr' THEN 'Créez un CV avec l''assistant guidé ou choisissez-en un existant, puis utilisez les outils IA. Vous pouvez essayer gratuitement un outil IA une fois ; Resumer Pro vous donne un accès illimité à tous.'
  WHEN 'ja' THEN 'ガイド付きビルダーで履歴書を作成するか既存のものを選び、AIツールを使います。AIツールは1回だけ無料でお試しでき、Resumer Proならすべて無制限で使えます。'
  WHEN 'es' THEN 'Crea un CV con el asistente guiado o elige uno existente y usa las herramientas de IA. Puedes probar gratis una herramienta de IA una vez; con Resumer Pro las usas todas sin límites.'
  WHEN 'ru' THEN 'Создайте CV с помощью мастера или выберите существующее, затем используйте ИИ-инструменты. Один ИИ-инструмент можно попробовать бесплатно один раз; с Resumer Pro все они доступны без ограничений.'
  WHEN 'ko' THEN '가이드 빌더로 이력서를 만들거나 기존 것을 선택한 뒤 AI 도구를 사용하세요. AI 도구는 한 번 무료로 체험할 수 있으며, Resumer Pro로 모든 도구를 무제한 사용할 수 있습니다.'
  WHEN 'hi' THEN 'गाइडेड बिल्डर से CV बनाएँ या मौजूदा चुनें, फिर AI टूल इस्तेमाल करें। आप किसी एक AI टूल को एक बार मुफ़्त आज़मा सकते हैं; Resumer Pro के साथ सभी टूल असीमित इस्तेमाल करें।'
  WHEN 'pt' THEN 'Crie um CV com o assistente guiado ou escolha um existente e use as ferramentas de IA. Você pode testar uma ferramenta de IA grátis uma vez; com o Resumer Pro, usa todas sem limites.'
  WHEN 'zh' THEN '使用引导式构建器创建简历或选择已有简历，然后使用 AI 工具。您可以免费试用一次 AI 工具；Resumer Pro 会员可无限使用全部工具。'
  ELSE answer END
WHERE id = 'faq_2' OR id LIKE 'faq\_2\_%';

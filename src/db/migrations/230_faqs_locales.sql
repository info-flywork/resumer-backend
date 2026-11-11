-- FAQ: AppLanguage 12 dil (en tohumu 100_content.sql'de; diğerleri burada)
INSERT INTO faqs (id, locale, question, answer, sort_order) VALUES
  ('faq_1_tr', 'tr', 'Resumer nedir?', 'Resumer, yapay zekâ destekli bir özgeçmiş asistanıdır. Adım adım CV oluşturabilir, ATS uyumluluğu için analiz edebilir, iş ilanına göre uyarlayabilir ve başka dillere çevirebilirsiniz.', 1),
  ('faq_2_tr', 'tr', 'Nasıl çalışır?', 'Rehberli oluşturucuyla bir CV oluşturun veya mevcut birini seçin, ardından yapay zekâ araçlarını kullanın. Her analiz, işe uyarlama veya çeviri bir AI kredisi harcar; Resumer Pro üyeleri aylık kredi alır.', 2),
  ('faq_3_tr', 'tr', 'Özgeçmişimi nasıl yüklerim?', 'Uygulamada CV Oluştur ile CV''nizi oluşturun veya herkese açık bir LinkedIn profil bağlantısını analiz edin. CV''leriniz hesabınıza kaydedilir ve tüm cihazlarınızda kullanılabilir.', 3),

  ('faq_1_de', 'de', 'Was ist Resumer?', 'Resumer ist ein KI-gestützter Lebenslauf-Assistent. Sie können einen CV Schritt für Schritt erstellen, auf ATS-Kompatibilität prüfen, an eine Stellenanzeige anpassen und in andere Sprachen übersetzen.', 1),
  ('faq_2_de', 'de', 'Wie funktioniert es?', 'Erstellen Sie einen CV mit dem geführten Builder oder wählen Sie einen vorhandenen, dann nutzen Sie die KI-Tools. Jede Analyse, Job-Anpassung oder Übersetzung verbraucht ein KI-Guthaben; Resumer-Pro-Mitglieder erhalten monatliche Credits.', 2),
  ('faq_3_de', 'de', 'Wie lade ich meinen Lebenslauf hoch?', 'Erstellen Sie Ihren CV in der App mit „CV erstellen“ oder analysieren Sie einen öffentlichen LinkedIn-Profil-Link. Ihre CVs werden in Ihrem Konto gespeichert und sind auf allen Geräten verfügbar.', 3),

  ('faq_1_it', 'it', 'Cos''è Resumer?', 'Resumer è un assistente CV basato sull''IA. Puoi creare un CV passo dopo passo, analizzarlo per la compatibilità ATS, adattarlo a un annuncio di lavoro e tradurlo in altre lingue.', 1),
  ('faq_2_it', 'it', 'Come funziona?', 'Crea un CV con il builder guidato o scegline uno esistente, poi usa gli strumenti IA. Ogni analisi, adattamento al lavoro o traduzione usa un credito IA; i membri Resumer Pro ricevono crediti mensili.', 2),
  ('faq_3_it', 'it', 'Come carico il mio curriculum?', 'Crea il CV nell''app con Crea un CV, oppure analizza un link pubblico al profilo LinkedIn. I CV sono salvati nel tuo account e disponibili su tutti i dispositivi.', 3),

  ('faq_1_fr', 'fr', 'Qu''est-ce que Resumer ?', 'Resumer est un assistant CV propulsé par l''IA. Vous pouvez créer un CV étape par étape, l''analyser pour la compatibilité ATS, l''adapter à une offre d''emploi et le traduire dans d''autres langues.', 1),
  ('faq_2_fr', 'fr', 'Comment ça marche ?', 'Créez un CV avec l''assistant guidé ou choisissez-en un existant, puis utilisez les outils IA. Chaque analyse, adaptation ou traduction consomme un crédit IA ; les membres Resumer Pro reçoivent des crédits mensuels.', 2),
  ('faq_3_fr', 'fr', 'Comment téléverser mon CV ?', 'Créez votre CV dans l''app avec Créer un CV, ou analysez un lien de profil LinkedIn public. Vos CV sont enregistrés dans votre compte et disponibles sur tous vos appareils.', 3),

  ('faq_1_ja', 'ja', 'Resumerとは何ですか？', 'ResumerはAI搭載の履歴書アシスタントです。ステップごとに履歴書を作成し、ATS適合性を分析し、求人に合わせて調整し、他の言語に翻訳できます。', 1),
  ('faq_2_ja', 'ja', '使い方は？', 'ガイド付きビルダーで履歴書を作成するか既存のものを選び、AIツールを使います。分析・求人適合・翻訳はそれぞれ1クレジットを消費し、Resumer Pro会員は毎月クレジットを受け取ります。', 2),
  ('faq_3_ja', 'ja', '履歴書のアップロード方法は？', 'アプリ内の「履歴書を作成」で作るか、公開LinkedInプロフィールのリンクを分析します。履歴書はアカウントに保存され、すべての端末で利用できます。', 3),

  ('faq_1_es', 'es', '¿Qué es Resumer?', 'Resumer es un asistente de currículum con IA. Puedes crear un CV paso a paso, analizarlo para compatibilidad ATS, adaptarlo a una oferta de empleo y traducirlo a otros idiomas.', 1),
  ('faq_2_es', 'es', '¿Cómo funciona?', 'Crea un CV con el asistente guiado o elige uno existente y usa las herramientas de IA. Cada análisis, adaptación o traducción usa un crédito de IA; los miembros Resumer Pro reciben créditos mensuales.', 2),
  ('faq_3_es', 'es', '¿Cómo subo mi currículum?', 'Crea tu CV en la app con Crear un CV, o analiza un enlace público de perfil de LinkedIn. Tus CV se guardan en tu cuenta y están disponibles en todos tus dispositivos.', 3),

  ('faq_1_ru', 'ru', 'Что такое Resumer?', 'Resumer — ИИ-помощник для резюме. Вы можете создать CV по шагам, проверить ATS-совместимость, адаптировать под вакансию и перевести на другие языки.', 1),
  ('faq_2_ru', 'ru', 'Как это работает?', 'Создайте CV с помощью мастера или выберите существующее, затем используйте ИИ-инструменты. Каждый анализ, адаптация или перевод тратит один ИИ-кредит; участники Resumer Pro получают кредиты ежемесячно.', 2),
  ('faq_3_ru', 'ru', 'Как загрузить резюме?', 'Создайте CV в приложении через «Создать CV» или проанализируйте публичную ссылку профиля LinkedIn. CV сохраняются в аккаунте и доступны на всех устройствах.', 3),

  ('faq_1_ko', 'ko', 'Resumer란 무엇인가요?', 'Resumer는 AI 기반 이력서 도우미입니다. 단계별로 이력서를 만들고 ATS 적합성을 분석하며, 채용 공고에 맞게 조정하고 다른 언어로 번역할 수 있습니다.', 1),
  ('faq_2_ko', 'ko', '어떻게 작동하나요?', '가이드 빌더로 이력서를 만들거나 기존 것을 선택한 뒤 AI 도구를 사용하세요. 분석·맞춤·번역마다 AI 크레딧 1개가 사용되며, Resumer Pro 회원은 매월 크레딧을 받습니다.', 2),
  ('faq_3_ko', 'ko', '이력서는 어떻게 업로드하나요?', '앱에서 이력서 만들기로 작성하거나 공개 LinkedIn 프로필 링크를 분석하세요. 이력서는 계정에 저장되며 모든 기기에서 사용할 수 있습니다.', 3),

  ('faq_1_hi', 'hi', 'Resumer क्या है?', 'Resumer एक AI-संचालित रिज़्यूमे सहायक है। आप चरणबद्ध तरीके से CV बना सकते हैं, ATS अनुकूलता के लिए विश्लेषण कर सकते हैं, नौकरी पोस्टिंग के अनुसार अनुकूलित कर सकते हैं और अन्य भाषाओं में अनुवाद कर सकते हैं।', 1),
  ('faq_2_hi', 'hi', 'यह कैसे काम करता है?', 'गाइडेड बिल्डर से CV बनाएँ या मौजूदा चुनें, फिर AI टूल इस्तेमाल करें। प्रत्येक विश्लेषण, जॉब टेलरिंग या अनुवाद एक AI क्रेडिट खर्च करता है; Resumer Pro सदस्यों को मासिक क्रेडिट मिलते हैं।', 2),
  ('faq_3_hi', 'hi', 'मैं अपना रिज़्यूमे कैसे अपलोड करूँ?', 'ऐप में CV बनाएँ से बनाएँ, या सार्वजनिक LinkedIn प्रोफ़ाइल लिंक का विश्लेषण करें। आपके CV खाते में सहेजे जाते हैं और सभी डिवाइस पर उपलब्ध होते हैं।', 3),

  ('faq_1_pt', 'pt', 'O que é o Resumer?', 'Resumer é um assistente de currículo com IA. Você pode criar um CV passo a passo, analisar a compatibilidade com ATS, adaptar a uma vaga e traduzir para outros idiomas.', 1),
  ('faq_2_pt', 'pt', 'Como funciona?', 'Crie um CV com o assistente guiado ou escolha um existente e use as ferramentas de IA. Cada análise, adaptação ou tradução usa um crédito de IA; membros Resumer Pro recebem créditos mensais.', 2),
  ('faq_3_pt', 'pt', 'Como envio meu currículo?', 'Crie seu CV no app com Criar um CV, ou analise um link público de perfil do LinkedIn. Seus CVs ficam salvos na conta e disponíveis em todos os dispositivos.', 3),

  ('faq_1_zh', 'zh', '什么是 Resumer？', 'Resumer 是一款 AI 驱动的简历助手。您可以逐步创建简历、分析 ATS 兼容性、针对职位进行优化，并翻译成其他语言。', 1),
  ('faq_2_zh', 'zh', '如何使用？', '使用引导式构建器创建简历或选择已有简历，然后使用 AI 工具。每次分析、职位定制或翻译消耗 1 个 AI 积分；Resumer Pro 会员每月获得积分。', 2),
  ('faq_3_zh', 'zh', '如何上传简历？', '在应用中通过“创建简历”制作，或分析公开的 LinkedIn 个人资料链接。简历保存在账户中，可在所有设备上使用。', 3);

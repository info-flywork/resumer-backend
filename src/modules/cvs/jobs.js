'use strict';

// Listeme kaydedilmemiş (çeviri sonucu) taslakları günde bir kez temizler.
exports.jobs = [{ name: 'cvs.purgeStaleDrafts', dailyAtUtc: '03:10', run: (deps) => deps.cvs.purgeStaleDrafts() }];

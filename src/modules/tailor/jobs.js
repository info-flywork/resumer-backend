'use strict';

// Uyarlama oturumlarını (7 günden eski) günde bir kez temizler.
exports.jobs = [{ name: 'tailor.purgeSessions', dailyAtUtc: '03:20', run: (deps) => deps.tailor.purgeSessions() }];

'use strict';

// Takılan (süreç çöktü) işleri başarısız sayar, 7 günden eski işleri siler.
exports.jobs = [{ name: 'tasks.cleanup', everyMs: 60_000, run: (deps) => deps.tasks.cleanup() }];

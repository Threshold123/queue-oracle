const db = require('better-sqlite3')('queue.db');
const rows = db.prepare(`
    SELECT strftime('%H', timestamp) as hour, 
           ROUND(AVG(people)) as avg_people
    FROM counts 
    WHERE location = 'restaurant'
    GROUP BY hour 
    ORDER BY hour
`).all();
rows.forEach(r => console.log(`Hour ${r.hour}: ${r.avg_people} people avg`));

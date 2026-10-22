// Optional launcher. `npm start` runs server.js directly. This file remains so older notes still boot the same process.
require('../server').listen().catch(e=>{console.error(e);process.exit(1)});

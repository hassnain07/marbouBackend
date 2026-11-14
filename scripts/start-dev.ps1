Set-Location "d:\codeclub\Marbou\marbouBackend"
$env:PORT = "3099"
npx ts-node --transpile-only -e "
require('dotenv').config();
const { createApp } = require('./src/bootstrap');
createApp().then(app => app.listen(3099)).then(() => console.log('API ready on :3099'));
"

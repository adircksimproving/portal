import express from 'express';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.static(__dirname));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Portal running at http://localhost:${PORT}`));

const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

const express = require('express');
const cors = require('cors');

const searchRoutes = require('./routes/search.routes');
const askRoutes = require('./routes/ask.routes');
const chatRoutes = require('./routes/chat.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API del buscador funcionando'
  });
});

app.use('/api', searchRoutes);
app.use('/api', askRoutes);
app.use('/api', chatRoutes);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
const path = require('path');
const OpenAI = require('openai');

require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Falta OPENAI_API_KEY en el archivo .env');
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

module.exports = client;
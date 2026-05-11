const express = require('express');
const router = express.Router();
const { searchContent } = require('../controllers/search.controller');

router.get('/search', searchContent);

module.exports = router;
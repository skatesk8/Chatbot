const pool = require('../db');

function cleanText(text, max = 180) {
  if (!text) return '';
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? cleaned.substring(0, max) + '...' : cleaned;
}

async function searchContent(req, res) {
  try {
    const q = req.query.q?.trim();
    const limit = Number(req.query.limit || 10);

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Debes enviar una búsqueda. Ejemplo: /api/search?q=dental'
      });
    }

    const sql = `
      SELECT
        c.id,
        c.external_id,
        c.title,
        c.content,
        c.permalink,
        c.post_type,
        c.published_at,
        c.source_file,
        sr.dealer_locations AS sales_rep_locations,
        sr.categories AS sales_rep_categories,
        sr.email,
        sr.phone AS sales_rep_phone,
        sr.rep_type,
        d.dealer_locations AS dealer_locations,
        d.categories AS dealer_categories,
        d.website,
        d.phone AS dealer_phone,
        tp.sort_order
      FROM content_items c
      LEFT JOIN sales_reps sr ON c.id = sr.content_item_id
      LEFT JOIN dealers d ON c.id = d.content_item_id
      LEFT JOIN training_programs tp ON c.id = tp.content_item_id
      WHERE
        c.title ILIKE $1
        OR c.content ILIKE $1
        OR c.permalink ILIKE $1
        OR sr.dealer_locations ILIKE $1
        OR sr.categories ILIKE $1
        OR sr.email ILIKE $1
        OR sr.phone ILIKE $1
        OR sr.rep_type ILIKE $1
        OR d.dealer_locations ILIKE $1
        OR d.categories ILIKE $1
        OR d.website ILIKE $1
        OR d.phone ILIKE $1
      ORDER BY
        CASE
          WHEN c.title ILIKE $1 THEN 1
          WHEN sr.email ILIKE $1 THEN 2
          WHEN d.website ILIKE $1 THEN 3
          WHEN c.content ILIKE $1 THEN 4
          ELSE 5
        END,
        c.id DESC
      LIMIT $2
    `;

    const result = await pool.query(sql, [`%${q}%`, limit]);

    const results = result.rows.map(row => {
      const categories = row.sales_rep_categories || row.dealer_categories || null;
      const dealerLocations = row.sales_rep_locations || row.dealer_locations || null;
      const phone = row.sales_rep_phone || row.dealer_phone || null;

      return {
        id: row.id,
        external_id: row.external_id,
        title: row.title,
        description: cleanText(row.content),
        url: row.permalink,
        type: row.post_type,
        published_at: row.published_at,
        source_file: row.source_file,
        extra: {
          email: row.email || null,
          phone,
          website: row.website || null,
          categories,
          dealer_locations: dealerLocations,
          rep_type: row.rep_type || null,
          sort_order: row.sort_order || null
        }
      };
    });

    return res.json({
      success: true,
      query: q,
      total: results.length,
      results
    });
  } catch (error) {
    console.error('Error en /api/search:', error);

    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

module.exports = {
  searchContent
};
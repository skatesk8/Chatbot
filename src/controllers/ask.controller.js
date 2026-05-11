const pool = require('../db');
const openai = require('../openai');

const COMPANY_CONTEXT = `
Air Techniques advances the dental industry with the latest equipment innovations.

The company provides reliable dental products that help today’s dental professionals stay Equipped for Life.

Air Techniques is a leading manufacturer of:
- Robust mechanical systems
- Intuitive digital imaging systems
- Highly effective hygiene products

The product portfolio includes solutions for dental practices, clinics, and universities, helping professionals improve imaging, workflow, hygiene, and equipment reliability.

Customers include:
- Private practices
- Clinics
- Universities

Air Techniques is committed to being a dependable partner by delivering products and solutions that meet individual customer needs.

Company facts:
- 60+ years in business
- 260+ products
- 140+ dealer partners worldwide`;

function cleanText(text, max = 500) {
  if (!text) return '';
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? cleaned.substring(0, max) + '...' : cleaned;
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function detectIntent(question) {
  const q = normalizeText(question);

  if (q.includes('proveedor') || q.includes('distribuidor') || q.includes('dealer')) {
    return { intent: 'dealers', postType: 'dealer', terms: ['dealer', 'distributor', 'equipment'] };
  }

  if (q.includes('capacitacion') || q.includes('entrenamiento') || q.includes('training') || q.includes('curso')) {
    return { intent: 'training', postType: 'training', terms: ['training', 'program', 'course'] };
  }

  if (q.includes('contacto') || q.includes('telefono') || q.includes('email') || q.includes('representante')) {
    return { intent: 'contact', postType: 'sales-rep', terms: ['sales', 'representative', 'contact'] };
  }

  if (q.includes('product') || q.includes('products') || q.includes('equipment') || q.includes('imaging') || q.includes('radiography') || q.includes('hygiene') || q.includes('mechanical')
  ) {
    return {
      intent: 'products',
      postType: 'product',
      terms: ['product', 'equipment', 'imaging', 'radiography', 'hygiene', 'mechanical']
    };
  }

  return {
    intent: 'general',
    postType: null,
    terms: q.split(/\s+/).filter(w => w.length > 3)
  };
}

async function searchDatabase(question) {
  const analysis = detectIntent(question);
  const patterns = analysis.terms.length
    ? analysis.terms.map(term => `%${term}%`)
    : [`%${question}%`];

  const sql = `
    SELECT
        c.id,
        c.title,
        c.content,
        c.permalink,
        c.post_type,
        sr.email,
        sr.phone AS sales_rep_phone,
        sr.categories AS sales_rep_categories,
        sr.rep_type,
        d.website,
        d.phone AS dealer_phone,
        d.categories AS dealer_categories,
        d.dealer_locations,
        tp.sort_order,
        p.product_categories,
        p.product_tags,
        p.stock_status,
        p.product_type,
        p.product_features,
        p.product_model_groups
    FROM content_items c
    LEFT JOIN sales_reps sr ON c.id = sr.content_item_id
    LEFT JOIN dealers d ON c.id = d.content_item_id
    LEFT JOIN training_programs tp ON c.id = tp.content_item_id
    LEFT JOIN products p ON c.id = p.content_item_id
    WHERE
      ($2::text IS NULL OR c.post_type = $2)
      AND (
        c.title ILIKE ANY($1)
        OR c.content ILIKE ANY($1)
        OR c.post_type ILIKE ANY($1)
        OR sr.categories ILIKE ANY($1)
        OR sr.email ILIKE ANY($1)
        OR sr.phone ILIKE ANY($1)
        OR sr.rep_type ILIKE ANY($1)
        OR d.categories ILIKE ANY($1)
        OR d.website ILIKE ANY($1)
        OR d.phone ILIKE ANY($1)
        OR d.dealer_locations ILIKE ANY($1)
        OR p.short_description ILIKE ANY($1)
        OR p.stock_status ILIKE ANY($1)
        OR p.product_type ILIKE ANY($1)
        OR p.brands ILIKE ANY($1)
        OR p.product_categories ILIKE ANY($1)
        OR p.product_tags ILIKE ANY($1)
        OR p.product_features ILIKE ANY($1)
        OR p.product_model_groups ILIKE ANY($1)
        OR p.content_hub_category ILIKE ANY($1)
      )
    ORDER BY c.id DESC
    LIMIT 6
  `;

  let result = await pool.query(sql, [patterns, analysis.postType]);

  if (!result.rows.length) {
    const fallback = await pool.query(
      `
      SELECT
        c.id,
        c.title,
        c.content,
        c.permalink,
        c.post_type
      FROM content_items c
      WHERE c.title ILIKE $1 OR c.content ILIKE $1 OR c.post_type ILIKE $1
      ORDER BY c.id DESC
      LIMIT 6
      `,
      [`%${question}%`]
    );

    result = fallback;
  }

  const sources = result.rows.map(row => ({
    id: row.id,
    title: row.title,
    description: cleanText(row.content, 450),
    url: row.permalink,
    type: row.post_type,
    extra: {
        email: row.email || null,
        phone: row.sales_rep_phone || row.dealer_phone || null,
        website: row.website || null,
        categories: row.sales_rep_categories || row.dealer_categories || row.product_categories || null,
        locations: row.dealer_locations || null,
        rep_type: row.rep_type || null,
        sort_order: row.sort_order || null,
        stock_status: row.stock_status || null,
        product_type: row.product_type || null,
        product_tags: row.product_tags || null,
        product_features: row.product_features || null,
        product_model_groups: row.product_model_groups || null
    }
  }));

  return { analysis, sources };
}

async function generateAIResponse(question, sources, history = []) {
  const conversationHistory = history.length
    ? history.map((msg) => `${msg.role}: ${msg.message}`).join('\n')
    : 'No previous conversation.';

  const context = sources.length
    ? sources.map((item, index) => `
Source ${index + 1}
Title: ${item.title}
Type: ${item.type}
Description: ${item.description}
URL: ${item.url}
Email: ${item.extra.email || 'N/A'}
Phone: ${item.extra.phone || 'N/A'}
Website: ${item.extra.website || 'N/A'}
Categories: ${item.extra.categories || 'N/A'}
Locations: ${item.extra.locations || 'N/A'}
Stock Status: ${item.extra.stock_status || 'N/A'}
Product Type: ${item.extra.product_type || 'N/A'}
Product Tags: ${item.extra.product_tags || 'N/A'}
Product Features: ${item.extra.product_features || 'N/A'}
Product Model Groups: ${item.extra.product_model_groups || 'N/A'}
`).join('\n')
    : 'No database results found. Use company knowledge to respond.';

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: `
You are an assistant for Air Techniques.

Always answer in English.

Company context:
${COMPANY_CONTEXT}

Rules:
- Use the previous conversation to understand follow-up questions.
- If the user asks "tell me more", "learn more", "what about that", or refers to something mentioned earlier, connect it to the previous conversation.
- Use database sources when available.
- Do not say you do not have information if a related source exists in the current sources or previous conversation.
- When the user asks about products, structure the answer like this:
  1. Brief intro sentence.
  2. Numbered list of 3 to 5 relevant products or categories.
  3. Short closing sentence inviting the user to choose a category or product.
- Prefer concrete product/category/training/dealer names from the database sources.
- Avoid starting answers with "Hello" unless the user greeted first.
- If no database source is available, answer using the company context and guide the user toward Air Techniques products, imaging systems, hygiene products, mechanical systems, dealers, or training.
- If the question is unrelated to Air Techniques or the dental industry, politely redirect the user back to Air Techniques.
- Do not invent specific product details, phone numbers, emails, prices, dates, dealers, or training programs.
- Do not include Markdown links in the answer. Sources are shown separately in the interface.
        `
      },
      {
        role: 'user',
        content: `
Previous conversation:
${conversationHistory}

Current user question:
${question}

Database sources:
${context}
        `
      }
    ]
  });

  return completion.choices[0].message.content;
}

async function getAnswerFromQuestion(question, history = []) {
  const { analysis, sources } = await searchDatabase(question);
  const answer = await generateAIResponse(question, sources, history);

  return {
    answer,
    sources,
    detected_intent: analysis.intent
  };
}

async function askQuestion(req, res) {
  try {
    const question = req.body.question?.trim();

    if (!question) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }

    const result = await getAnswerFromQuestion(question);

    return res.json({
      success: true,
      ai: true,
      question,
      detected_intent: result.detected_intent,
      answer: result.answer,
      total_sources: result.sources.length,
      sources: result.sources
    });
  } catch (error) {
    console.error('Error in /api/ask:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

module.exports = {
  askQuestion,
  getAnswerFromQuestion
};